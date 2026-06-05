// Buffer scheduling — thin client over the `buffer-proxy` edge function.
// The proxy reads the content_posts row, builds the media-capable Buffer
// mutation server-side, and holds BUFFER_API_KEY. We only pass the post id
// (+ the non-secret channel ids) — no Buffer key or GraphQL lives in the browser.

import { Platform } from "@/types/content";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BUFFER_PROXY_URL = `${SUPABASE_URL}/functions/v1/buffer-proxy`;

// Channel IDs are identifiers, not secrets — safe to keep client-side and pass in.
const CHANNEL_IDS: Record<Platform, string | undefined> = {
  instagram: import.meta.env.VITE_BUFFER_INSTAGRAM_ID,
  facebook: import.meta.env.VITE_BUFFER_FACEBOOK_ID,
  linkedin: import.meta.env.VITE_BUFFER_LINKEDIN_ID,
};

export function isBufferConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

export function getChannelId(platform: Platform): string | undefined {
  return CHANNEL_IDS[platform];
}

export function validatePlatforms(platforms: Platform[]): { valid: Platform[]; invalid: Platform[] } {
  const valid: Platform[] = [];
  const invalid: Platform[] = [];
  platforms.forEach((p) => (CHANNEL_IDS[p] ? valid.push(p) : invalid.push(p)));
  return { valid, invalid };
}

export interface PushResult {
  ok: boolean;
  status: "scheduled" | "manual" | "failed" | string;
  buffer_post_ids: Record<string, string>;
  errors: string[];
}

/**
 * Push an existing content_posts row to Buffer. The row must already have
 * media_urls (public Cloudinary URLs) and per-platform captions saved.
 */
export async function pushToBuffer(postId: string): Promise<PushResult> {
  const res = await fetch(BUFFER_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      postId,
      channelIds: {
        instagram: CHANNEL_IDS.instagram,
        facebook: CHANNEL_IDS.facebook,
        linkedin: CHANNEL_IDS.linkedin,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok && !data?.status) {
    throw new Error(data?.error || `Buffer push failed (${res.status})`);
  }
  return {
    ok: !!data.ok,
    status: data.status ?? "failed",
    buffer_post_ids: data.buffer_post_ids ?? {},
    errors: data.errors ?? (data.error ? [data.error] : []),
  };
}
