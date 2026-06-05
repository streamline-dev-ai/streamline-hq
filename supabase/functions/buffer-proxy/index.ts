// buffer-proxy — media-capable Buffer publisher (rewritten 2026-06-04)
//
// Contract: POST { postId, channelIds? }
//   - reads the content_posts row server-side (service role)
//   - builds ONE createPost mutation per selected platform using Buffer's
//     CURRENT assets format (verified live via introspection):
//        assets: [{ image: { url } }]  or  [{ video: { url } }]
//   - Instagram requires metadata.instagram.{ type, shouldShareToFeed }
//     where type = post (1 img) | carousel (multi) | reel (video) | story
//   - Facebook requires metadata.facebook.type ; LinkedIn needs neither
//   - reels: try automatic; if Buffer demands a reminder, retry as
//     schedulingType:notification and mark the row 'manual' (never silently fail)
//   - stores returned ids in buffer_post_ids, sets status, writes any error
//
// Secrets stay server-side: BUFFER_API_KEY is read from the function env and
// never leaves this file. Channel IDs are NOT secret and are passed in.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUFFER_GRAPHQL = "https://api.buffer.com/graphql";

type Platform = "instagram" | "facebook" | "linkedin";

const CREATE_POST = `mutation Create($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id status } }
    ... on MutationError { message }
    ... on UnexpectedError { message }
  }
}`;

const isVideo = (u: string) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u);

function buildAssets(contentType: string, mediaUrls: string[]) {
  const urls = (mediaUrls || []).filter(Boolean);
  if (contentType === "reel") {
    const vid = urls.find(isVideo) ?? urls[0];
    return vid ? [{ video: { url: vid } }] : [];
  }
  // static / carousel / story → images, IG hard-caps carousels at 10
  return urls.filter((u) => !isVideo(u)).slice(0, 10).map((u) => ({ image: { url: u } }));
}

function metadataFor(
  platform: Platform,
  contentType: string,
  imageCount: number,
  firstComment: string | null,
) {
  if (platform === "instagram") {
    // Buffer only accepts post | story | reel for IG. A multi-image "post"
    // becomes a carousel automatically — there is no 'carousel' type.
    const type = contentType === "reel" ? "reel" : contentType === "story" ? "story" : "post";
    const m: Record<string, unknown> = { type, shouldShareToFeed: true };
    if (firstComment) m.firstComment = firstComment;
    return { instagram: m };
  }
  if (platform === "facebook") {
    const type = contentType === "reel" ? "reel" : contentType === "story" ? "story" : "post";
    const m: Record<string, unknown> = { type };
    if (firstComment) m.firstComment = firstComment;
    return { facebook: m };
  }
  // linkedin: no type required
  const m: Record<string, unknown> = {};
  if (firstComment) m.firstComment = firstComment;
  return Object.keys(m).length ? { linkedin: m } : undefined;
}

async function bufferFetch(apiKey: string, variables: Record<string, unknown>) {
  const res = await fetch(BUFFER_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: CREATE_POST, variables }),
  });
  return await res.json();
}

async function createForChannel(
  apiKey: string,
  channelId: string,
  text: string,
  assets: unknown[],
  metadata: unknown,
  dueAt: string | null,
  isReel: boolean,
): Promise<{ ok: boolean; id?: string; manual?: boolean; error?: string }> {
  const baseInput = (schedulingType: string) => {
    const input: Record<string, unknown> = {
      channelId,
      text,
      schedulingType,
      mode: dueAt ? "customScheduled" : "addToQueue",
      assets,
    };
    if (dueAt) input.dueAt = dueAt;
    if (metadata) input.metadata = metadata;
    return input;
  };

  const parse = (json: any) => {
    const cp = json?.data?.createPost;
    if (cp?.__typename === "PostActionSuccess" && cp?.post?.id) {
      return { ok: true as const, id: cp.post.id as string };
    }
    const msg = cp?.message || json?.errors?.[0]?.message || "Unknown Buffer error";
    return { ok: false as const, error: msg as string };
  };

  // First attempt: auto-publish.
  const first = parse(await bufferFetch(apiKey, { input: baseInput("automatic") }));
  if (first.ok) return first;

  // Reels can require a manual reminder rather than failing — route, don't drop.
  if (isReel && /notification|reminder|manual|trending|audio|cannot.*auto|not.*support/i.test(first.error)) {
    const retry = parse(await bufferFetch(apiKey, { input: baseInput("notification") }));
    if (retry.ok) return { ok: true, id: retry.id, manual: true };
    return { ok: false, error: retry.error };
  }
  return first;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("BUFFER_API_KEY");
    if (!apiKey) return json({ error: "BUFFER_API_KEY not configured" }, 500);

    const { postId, channelIds } = await req.json();
    if (!postId) return json({ error: "Missing postId" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: post, error: readErr } = await supabase
      .from("content_posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (readErr || !post) return json({ error: `Post not found: ${readErr?.message ?? postId}` }, 404);

    // Channel IDs: prefer ones passed by the caller, fall back to env.
    const channels: Record<Platform, string | undefined> = {
      instagram: channelIds?.instagram ?? Deno.env.get("BUFFER_INSTAGRAM_ID") ?? undefined,
      facebook: channelIds?.facebook ?? Deno.env.get("BUFFER_FACEBOOK_ID") ?? undefined,
      linkedin: channelIds?.linkedin ?? Deno.env.get("BUFFER_LINKEDIN_ID") ?? undefined,
    };

    const platforms: Platform[] = (post.platforms ?? []) as Platform[];
    const mediaUrls: string[] = post.media_urls ?? [];
    const contentType: string = post.content_type ?? "static";
    const isReel = contentType === "reel";

    if (mediaUrls.length === 0) {
      await supabase.from("content_posts").update({
        status: "failed",
        error: "No media_urls on post — upload media (Cloudinary) before pushing to Buffer.",
      }).eq("id", postId);
      return json({ error: "No media on post" }, 400);
    }

    const assets = buildAssets(contentType, mediaUrls);
    const imageCount = assets.filter((a: any) => "image" in a).length;
    const dueAt = post.scheduled_for ? new Date(post.scheduled_for).toISOString() : null;
    const captions = (post.captions ?? {}) as Record<string, string>;

    const bufferIds: Record<string, string> = { ...(post.buffer_post_ids ?? {}) };
    const errors: string[] = [];
    let anyManual = false;
    let anySuccess = false;

    for (const platform of platforms) {
      const channelId = channels[platform];
      if (!channelId) { errors.push(`${platform}: no channel id`); continue; }

      const text = captions[platform] || post.caption_master || post.caption || "";
      const metadata = metadataFor(platform, contentType, imageCount, post.first_comment ?? null);

      const r = await createForChannel(apiKey, channelId, text, assets, metadata, dueAt, isReel);
      if (r.ok && r.id) {
        bufferIds[platform] = r.id;
        anySuccess = true;
        if (r.manual) anyManual = true;
      } else {
        errors.push(`${platform}: ${r.error}`);
      }
    }

    const status = !anySuccess ? "failed" : anyManual ? "manual" : "scheduled";
    await supabase.from("content_posts").update({
      status,
      buffer_post_ids: bufferIds,
      error: errors.length ? errors.join(" | ") : null,
    }).eq("id", postId);

    return json({ ok: anySuccess, status, buffer_post_ids: bufferIds, errors });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
