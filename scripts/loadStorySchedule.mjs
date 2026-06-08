// Load a week's STORY schedule into story_queue for the server-side Telegram
// assistant. For each slot it uploads the card image to Cloudinary and inserts a
// pending row with image_url + scheduled_at. The cron job `story-telegram-slots`
// (every 5 min) then sends each card with its instructions at the right moment —
// fully server-side, so it fires even with this PC off.
//
//   node scripts/loadStorySchedule.mjs ["...\story-schedule.json"] [--replace] [--dry-run]
//
// Defaults to Social Media\Planning\telegram\story-schedule.json. Image paths in
// that file are relative to the Social Media root (the folder above streamline-admin\..).
// --replace wipes existing pending rows first (use when reloading a week).

import { readFile, access } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { loadEnv, makeSupabase, cloudinaryCreds, assertCloudinary, uploadToCloudinary } from "./_shared.mjs";

const DEFAULT_SCHEDULE = "C:\\Users\\User\\Desktop\\Streamline\\Social Media\\Planning\\telegram\\story-schedule.json";
const PROJECT_ROOT = "C:\\Users\\User\\Desktop\\Streamline\\Social Media";

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv) {
    if (a === "--replace") args.replace = true;
    else if (a === "--dry-run") args.dryRun = true;
    else args._.push(a);
  }
  return args;
}

// "2026-06-08T09:00:00" (naive SAST) -> ISO with +02:00 offset
function toIso(when) {
  const raw = /[+-]\d\d:\d\d$/.test(when) ? when : `${when}+02:00`;
  return new Date(raw).toISOString();
}

function hhmm(when) {
  const m = when.match(/T(\d\d:\d\d)/);
  return m ? m[1] : "";
}

function caption(slot) {
  const time = hhmm(slot.when);
  const head = time ? `📲 STORY TIME · ${time}` : "📲 STORY TIME";
  return `${head}\n\n${slot.title}\n\n${slot.instructions}`;
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const schedulePath = args._[0] || DEFAULT_SCHEDULE;

  const cfg = JSON.parse(await readFile(schedulePath, "utf8"));
  const slots = Array.isArray(cfg.stories) ? cfg.stories : [];
  if (slots.length === 0) { console.error("schedule has no stories"); process.exit(1); }

  console.log(`${slots.length} story slots in ${schedulePath}\n`);

  const env = await loadEnv();
  const creds = cloudinaryCreds(env);
  assertCloudinary(creds);

  // resolve + validate every image up front; cache uploads by local path
  const uploadCache = new Map();
  const rows = [];
  for (const s of slots) {
    const rel = (s.image || "").replace(/\//g, "\\");
    const abs = isAbsolute(rel) ? rel : resolve(PROJECT_ROOT, rel);
    rows.push({ slot: s, abs, scheduled_at: toIso(s.when), text: caption(s) });
  }

  // report + missing-image check
  let missing = 0;
  for (const r of rows) {
    const ok = await exists(r.abs);
    if (!ok) { missing++; console.log(`  ✗ MISSING IMAGE  ${r.slot.id}  -> ${r.abs}`); }
    else console.log(`  • ${r.slot.id.padEnd(14)} ${hhmm(r.slot.when)}  ${r.slot.title}`);
    r.ok = ok;
  }
  if (missing > 0) console.log(`\n⚠ ${missing} slot(s) have no image file — they'll be loaded as text-only.`);

  if (args.dryRun) { console.log("\n(dry run — no uploads, no DB writes)"); return; }

  const supabase = await makeSupabase(env);

  if (args.replace) {
    const { error } = await supabase.from("story_queue").delete().eq("status", "pending");
    if (error) throw new Error(`clear failed: ${error.message}`);
    console.log("\nCleared existing pending stories.");
  }

  console.log("\nUploading cards + inserting rows...");
  let inserted = 0;
  for (const r of rows) {
    let image_url = null;
    if (r.ok) {
      if (uploadCache.has(r.abs)) {
        image_url = uploadCache.get(r.abs);
      } else {
        image_url = await uploadToCloudinary(creds, r.abs, "story-cards");
        uploadCache.set(r.abs, image_url);
      }
    }
    const { error } = await supabase.from("story_queue").insert({
      template_path: r.slot.image ?? null,
      instruction_text: r.text,
      image_url,
      scheduled_at: r.scheduled_at,
      status: "pending",
    });
    if (error) { console.log(`  ✗ ${r.slot.id}: ${error.message}`); continue; }
    inserted++;
    console.log(`  ✓ ${r.slot.id}`);
  }

  console.log(`\nDone. inserted=${inserted} (uploaded ${uploadCache.size} unique images)`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
