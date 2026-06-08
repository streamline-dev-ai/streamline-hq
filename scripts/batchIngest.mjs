// Weekly batch: week.json → upload every post's media to Cloudinary, queue a
// content_posts row per post with its computed schedule, and push them to Buffer
// (Buffer then auto-publishes each at its dueAt). This is the desktop→cloud bridge
// — it MUST run on your machine, because it reads your local Posts\ folders.
//
//   node scripts/batchIngest.mjs "C:\Users\User\Desktop\Streamline\Social Media\week.json"
//   ...  --no-push     queue + schedule rows but don't send to Buffer (review in admin first)
//   ...  --dry-run     just print the resolved schedule; no uploads, no inserts
//
// week.json (lives next to your Posts\ folder):
// {
//   "timezone": "Africa/Johannesburg",   // informational
//   "utc_offset": "+02:00",              // SAST; used for the actual conversion (default +02:00)
//   "week_start": "2026-06-08",          // the Monday of the week
//   "posts": [
//     { "folder": "Posts/Carousels/01-blom-hero", "platforms": ["instagram","facebook","linkedin"], "day": "Mon", "time": "11:00" },
//     { "folder": "Posts/Static/03-7day-guarantee", "platforms": ["instagram","facebook"], "date": "2026-06-10", "time": "12:00" }
//   ]
// }

import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import {
  loadEnv, gatherMedia, inferContentType, cloudinaryCreds, assertCloudinary,
  uploadToCloudinary, readCaptionSet, makeSupabase, pushToBuffer,
} from "./_shared.mjs";

const DAY_INDEX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv) {
    if (a === "--no-push") args.noPush = true;
    else if (a === "--dry-run") args.dryRun = true;
    else args._.push(a);
  }
  return args;
}

// day/time (+ SAST offset) → UTC ISO string Buffer can schedule against.
function resolveDueAt(week, post) {
  const offset = week.utc_offset || "+02:00";
  let dateStr = post.date;
  if (!dateStr) {
    const idx = DAY_INDEX[String(post.day || "").slice(0, 3).toLowerCase()];
    if (idx === undefined) throw new Error(`post needs a valid "day" or "date": ${post.folder}`);
    const [y, m, d] = week.week_start.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d) + idx * 86400000);
    dateStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  const time = post.time || "11:00";
  const iso = new Date(`${dateStr}T${time}:00${offset}`).toISOString();
  if (Number.isNaN(Date.parse(iso))) throw new Error(`bad date/time for ${post.folder}: ${dateStr} ${time}`);
  return iso;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const weekPath = args._[0];
  if (!weekPath) {
    console.error('Usage: node scripts/batchIngest.mjs <week.json> [--no-push] [--dry-run]');
    process.exit(1);
  }

  const week = JSON.parse(await readFile(weekPath, "utf8"));
  const root = dirname(weekPath);
  if (!Array.isArray(week.posts) || week.posts.length === 0) {
    console.error("week.json has no posts");
    process.exit(1);
  }

  const env = await loadEnv();
  const supabase = await makeSupabase(env);
  const creds = cloudinaryCreds(env);
  if (!args.dryRun) assertCloudinary(creds);

  console.log(`Week starting ${week.week_start} — ${week.posts.length} post(s)\n`);

  const results = [];
  for (const post of week.posts) {
    const folderPath = isAbsolute(post.folder) ? post.folder : join(root, post.folder);
    const folderName = basename(folderPath.replace(/[\\/]+$/, ""));
    try {
      const dueAt = resolveDueAt(week, post);
      const media = await gatherMedia(folderPath);
      if (media.length === 0) throw new Error("no media in folder");
      const content_type = inferContentType(media);
      const platforms = post.platforms?.length ? post.platforms : ["instagram", "facebook", "linkedin"];

      console.log(`• ${folderName}  [${content_type}]  ${platforms.join("·")}  @ ${dueAt}`);

      if (args.dryRun) { results.push({ folderName, status: "dry-run" }); continue; }

      // Idempotent: skip if this exact folder is already queued for this exact time.
      const existing = await supabase
        .from("content_posts")
        .select("id,status")
        .eq("source_folder", folderPath)
        .eq("scheduled_for", dueAt)
        .maybeSingle();
      if (existing.data) {
        console.log(`    already queued (${existing.data.status}) — skipping`);
        results.push({ folderName, status: "skipped" });
        continue;
      }

      const cloudFolder = `streamline-content/${folderName}`;
      const media_urls = [];
      for (const f of media) {
        process.stdout.write(`    ↑ ${f} ... `);
        media_urls.push(await uploadToCloudinary(creds, join(folderPath, f), cloudFolder));
        console.log("ok");
      }

      const { master, captions } = await readCaptionSet(folderPath);
      const { data, error } = await supabase
        .from("content_posts")
        .insert({
          title: folderName,
          content_type,
          platforms,
          media_urls,
          caption_master: master || null,
          captions,
          status: "queued",
          source_folder: folderPath,
          scheduled_for: dueAt,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      let status = "queued";
      if (!args.noPush) {
        const r = await pushToBuffer(env, data.id);
        status = r.status;
        console.log(`    → Buffer: ${r.status}${r.errors.length ? ` (${r.errors.join("; ")})` : ""}`);
      }
      results.push({ folderName, id: data.id, status });
    } catch (e) {
      console.log(`    ✗ ${e instanceof Error ? e.message : e}`);
      results.push({ folderName, status: "error", error: String(e) });
    }
  }

  // summary
  const by = (s) => results.filter((r) => r.status === s).length;
  console.log(`\nDone. scheduled=${by("scheduled")} manual=${by("manual")} queued=${by("queued")} skipped=${by("skipped")} failed=${by("failed") + by("error")}`);
  if (results.some((r) => r.status === "error" || r.status === "failed")) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
