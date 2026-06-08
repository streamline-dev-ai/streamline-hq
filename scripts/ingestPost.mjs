// Single folder → one content_posts row (status=queued).
//
//   node scripts/ingestPost.mjs "C:\path\to\post-folder"
//   node scripts/ingestPost.mjs ./folder --platforms instagram,facebook --schedule 2026-06-10T08:00 --push
//
// Folder layout: slide-1.png, slide-2.png, … (ordered) or a *.mp4 for a reel,
// plus caption.txt (master) and optional caption-instagram/facebook/linkedin.txt.
//
// .env.local needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and Cloudinary creds
// (CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET, or CLOUDINARY_URL). --push also needs
// the VITE_BUFFER_*_ID channel ids.

import { basename, join } from "node:path";
import {
  loadEnv, gatherMedia, inferContentType, cloudinaryCreds, assertCloudinary,
  uploadToCloudinary, readCaptionSet, makeSupabase, pushToBuffer,
} from "./_shared.mjs";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--platforms") args.platforms = argv[++i];
    else if (a === "--schedule") args.schedule = argv[++i];
    else if (a === "--title") args.title = argv[++i];
    else if (a === "--push") args.push = true;
    else args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const folderPath = args._[0];
  if (!folderPath) {
    console.error("Usage: node scripts/ingestPost.mjs <post-folder> [--platforms a,b] [--schedule ISO] [--title T] [--push]");
    process.exit(1);
  }

  const env = await loadEnv();
  const supabase = await makeSupabase(env);
  const creds = cloudinaryCreds(env);
  assertCloudinary(creds);

  const media = await gatherMedia(folderPath);
  if (media.length === 0) {
    console.error(`No media (images/video) found in ${folderPath}`);
    process.exit(1);
  }
  const content_type = inferContentType(media);
  const folderName = basename(folderPath.replace(/[\\/]+$/, ""));
  const cloudFolder = `streamline-content/${folderName}`;

  console.log(`Ingesting "${folderName}" — ${media.length} file(s), type=${content_type}`);
  const media_urls = [];
  for (const f of media) {
    process.stdout.write(`  ↑ ${f} ... `);
    media_urls.push(await uploadToCloudinary(creds, join(folderPath, f), cloudFolder));
    console.log("done");
  }

  const { master, captions } = await readCaptionSet(folderPath);
  const platforms = args.platforms
    ? args.platforms.split(",").map((s) => s.trim()).filter(Boolean)
    : ["instagram", "facebook", "linkedin"];
  const scheduled_for = args.schedule ? new Date(args.schedule).toISOString() : null;

  const { data, error } = await supabase
    .from("content_posts")
    .insert({
      title: args.title || folderName,
      content_type,
      platforms,
      media_urls,
      caption_master: master || null,
      captions,
      status: "queued",
      source_folder: folderPath,
      scheduled_for,
    })
    .select("id")
    .single();
  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  console.log(`\n✓ Queued content_posts row: ${data.id}`);
  console.log(`  type=${content_type}  platforms=${platforms.join(",")}  media=${media_urls.length}`);
  if (scheduled_for) console.log(`  scheduled_for=${scheduled_for}`);

  if (args.push) {
    process.stdout.write("  → pushing to Buffer ... ");
    const r = await pushToBuffer(env, data.id);
    console.log(r.status + (r.errors.length ? ` (${r.errors.join("; ")})` : ""));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
