// Load a rotating stories list into story_queue. The daily 08:00 SAST cron
// (send_next_story) then sends them to Telegram one per day, oldest first.
//
//   node scripts/loadStories.mjs "C:\Users\User\Desktop\Streamline\Social Media\stories.json"
//   ...  --replace   wipe existing *pending* stories first, then load fresh
//   ...  --dry-run   print what would be inserted; no DB writes
//
// stories.json (lives next to your Posts\ folder):
// {
//   "stories": [
//     {
//       "file": "C:\\...\\Social Media\\Stories\\01-bts.mp4",   // path you'll post from
//       "plan": "Raw behind-the-scenes of building a client site.",
//       "question_sticker": "What would you automate first?",   // optional
//       "poll": ["Yes, show me", "Not yet"],                    // optional
//       "link": "https://streamlineautomations.co.za",          // optional
//       "scheduled_at": "2026-06-09"                            // optional; won't send before this date
//     }
//   ]
// }
//
// Dedupe: a story whose `file` already exists as a pending/sent row is skipped,
// so re-running is safe. Use --replace to clear pending rows and reload.

import { readFile } from "node:fs/promises";
import { loadEnv, makeSupabase } from "./_shared.mjs";

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv) {
    if (a === "--replace") args.replace = true;
    else if (a === "--dry-run") args.dryRun = true;
    else args._.push(a);
  }
  return args;
}

function toRow(story) {
  const offset = "+02:00"; // SAST — a bare date means "08:00 that morning" effectively
  let scheduled_at = null;
  if (story.scheduled_at) {
    const raw = story.scheduled_at.includes("T")
      ? story.scheduled_at
      : `${story.scheduled_at}T00:00:00${offset}`;
    scheduled_at = new Date(raw).toISOString();
  }
  return {
    template_path: story.file ?? story.template_path ?? null,
    instruction_text: story.plan ?? story.instruction_text ?? null,
    question_sticker: story.question_sticker ?? null,
    poll_options: Array.isArray(story.poll) ? story.poll : (story.poll_options ?? null),
    link_url: story.link ?? story.link_url ?? null,
    scheduled_at,
    status: "pending",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const path = args._[0];
  if (!path) {
    console.error('Usage: node scripts/loadStories.mjs <stories.json> [--replace] [--dry-run]');
    process.exit(1);
  }

  const cfg = JSON.parse(await readFile(path, "utf8"));
  const stories = Array.isArray(cfg.stories) ? cfg.stories : [];
  if (stories.length === 0) {
    console.error("stories.json has no stories");
    process.exit(1);
  }

  const rows = stories.map(toRow);
  console.log(`${rows.length} story/stories in ${path}\n`);
  for (const r of rows) {
    console.log(`• ${r.template_path || "(no file)"}  ${r.scheduled_at ? `@ ${r.scheduled_at}` : "(next in queue)"}`);
  }
  if (args.dryRun) { console.log("\n(dry run — nothing written)"); return; }

  const env = await loadEnv();
  const supabase = await makeSupabase(env);

  if (args.replace) {
    const { error } = await supabase.from("story_queue").delete().eq("status", "pending");
    if (error) throw new Error(`clear failed: ${error.message}`);
    console.log("\nCleared existing pending stories.");
  }

  let inserted = 0, skipped = 0;
  for (const r of rows) {
    if (!args.replace && r.template_path) {
      const { data: existing } = await supabase
        .from("story_queue")
        .select("id")
        .eq("template_path", r.template_path)
        .maybeSingle();
      if (existing) { skipped++; continue; }
    }
    const { error } = await supabase.from("story_queue").insert(r);
    if (error) { console.log(`  ✗ ${r.template_path}: ${error.message}`); continue; }
    inserted++;
  }

  console.log(`\nDone. inserted=${inserted} skipped=${skipped}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
