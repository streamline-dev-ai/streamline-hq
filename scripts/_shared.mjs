// Shared helpers for the content-ingestion scripts (ingestPost + batchIngest).
// One source of truth for env loading, Cloudinary upload, media/caption reading,
// and the Buffer push — so the two entry scripts stay thin and can't drift.

import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export async function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const txt = await readFile(file, "utf8");
      const env = {};
      for (const line of txt.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i === -1) continue;
        let v = t.slice(i + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        env[t.slice(0, i).trim()] = v;
      }
      return env;
    } catch { /* try next */ }
  }
  return {};
}

export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
export const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);

// natural sort so slide-2 < slide-10
export const naturalCompare = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Ordered list of media filenames in a folder (images + video). */
export async function gatherMedia(folderPath) {
  const entries = await readdir(folderPath);
  return entries
    .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()) || VIDEO_EXT.has(extname(f).toLowerCase()))
    .sort(naturalCompare);
}

/** 1 image = static · many images = carousel · any video = reel. */
export function inferContentType(mediaFiles) {
  const hasVideo = mediaFiles.some((f) => VIDEO_EXT.has(extname(f).toLowerCase()));
  if (hasVideo) return "reel";
  return mediaFiles.length > 1 ? "carousel" : "static";
}

export function cloudinaryCreds(env) {
  if (env.CLOUDINARY_URL) {
    const m = env.CLOUDINARY_URL.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (m) return { apiKey: m[1], apiSecret: m[2], cloudName: m[3] };
  }
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME || "dbhiu7lv0",
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  };
}

export function assertCloudinary(creds) {
  if (!creds.apiKey || !creds.apiSecret) {
    throw new Error(
      "Missing Cloudinary credentials. Add CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET (or CLOUDINARY_URL) to .env.local",
    );
  }
}

/** Signed upload of one file → returns its public secure_url. `auto` handles image+video. */
export async function uploadToCloudinary(creds, filePath, folder) {
  const ts = Math.floor(Date.now() / 1000);
  const toSign = `folder=${folder}&timestamp=${ts}`; // params signed alphabetically
  const signature = createHash("sha1").update(toSign + creds.apiSecret).digest("hex");

  const buf = await readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf]), basename(filePath));
  form.append("api_key", creds.apiKey);
  form.append("timestamp", String(ts));
  form.append("folder", folder);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${creds.cloudName}/auto/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(`Cloudinary upload failed for ${basename(filePath)}: ${data?.error?.message || res.status}`);
  }
  return data.secure_url;
}

export async function readCaptionFile(folderPath, name) {
  try {
    return (await readFile(join(folderPath, name), "utf8")).trim();
  } catch {
    return "";
  }
}

/** master + per-platform captions; each platform falls back to master. */
export async function readCaptionSet(folderPath) {
  const master = await readCaptionFile(folderPath, "caption.txt");
  const captions = {};
  for (const p of ["instagram", "facebook", "linkedin"]) {
    const specific = await readCaptionFile(folderPath, `caption-${p}.txt`);
    captions[p] = specific || master;
  }
  return { master, captions };
}

export function makeSupabase(env) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local");
  }
  return createClient(url, key);
}

/** Push a queued row to Buffer via the edge function (channel ids from env). */
export async function pushToBuffer(env, postId) {
  const url = `${env.VITE_SUPABASE_URL}/functions/v1/buffer-proxy`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      postId,
      channelIds: {
        instagram: env.VITE_BUFFER_INSTAGRAM_ID,
        facebook: env.VITE_BUFFER_FACEBOOK_ID,
        linkedin: env.VITE_BUFFER_LINKEDIN_ID,
      },
    }),
  });
  const data = await res.json();
  return {
    ok: !!data.ok,
    status: data.status ?? "failed",
    buffer_post_ids: data.buffer_post_ids ?? {},
    errors: data.errors ?? (data.error ? [data.error] : []),
  };
}
