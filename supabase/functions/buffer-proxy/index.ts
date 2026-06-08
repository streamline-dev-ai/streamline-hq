// buffer-proxy — media-capable Buffer publisher (rewritten 2026-06-08)
//
// Contract: POST { postId, channelIds?, apiKeyB? }
//   - reads the content_posts row server-side (service role)
//   - builds ONE createPost mutation per selected platform using Buffer's
//     CURRENT assets format (verified live via introspection):
//        assets: [{ image: { url } }]  or  [{ video: { url } }]
//   - Instagram requires metadata.instagram.{ type, shouldShareToFeed }
//     where type = post (1 img) | carousel (multi) | reel (video) | story
//   - Facebook requires metadata.facebook.type ; LinkedIn needs neither
//   - TikTok metadata.tiktok (title optional) ; YouTube metadata.youtube
//     requires { title, privacy } (Shorts). Both verified live via introspection.
//   - reels: try automatic; if Buffer demands a reminder, retry as
//     schedulingType:notification and mark the row 'manual' (never silently fail)
//   - DUAL ACCOUNT: IG/FB/LI are on Buffer account A (BUFFER_API_KEY, server-side).
//     TikTok/YouTube are on account B — its key arrives as apiKeyB (or env
//     BUFFER_API_KEY_B). A platform with no key for its account is reported, not dropped.
//   - IDEMPOTENT: a platform already in buffer_post_ids is skipped, so re-pushing
//     only fills in the platforms that haven't gone out yet.
//   - stores returned ids in buffer_post_ids, sets status, writes any error
//
// Secrets stay server-side. BUFFER_API_KEY is read from the function env.
// Channel IDs are NOT secret and are passed in.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUFFER_GRAPHQL = "https://api.buffer.com/graphql";

type Platform = "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube";
const ACCOUNT_B: Platform[] = ["tiktok", "youtube"];

const CREATE_POST = `mutation Create($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id status } }
    ... on MutationError { message }
    ... on UnexpectedError { message }
  }
}`;

const DELETE_POST = `mutation Del($input: DeletePostInput!) {
  deletePost(input: $input) {
    __typename
    ... on VoidMutationError { message }
  }
}`;

// Delete a scheduled Buffer post by id, using the key for its account.
async function bufferDelete(apiKey: string, id: string) {
  const res = await fetch(BUFFER_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: DELETE_POST, variables: { input: { id } } }),
  });
  const j = await res.json();
  const dp = j?.data?.deletePost;
  const tn = dp?.__typename || "";
  if (dp && !/Error/i.test(tn)) return { ok: true as const };
  return { ok: false as const, error: dp?.message || j?.errors?.[0]?.message || "delete failed" };
}

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
  firstComment: string | null,
  ytTitle: string | null,
) {
  if (platform === "instagram") {
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
  if (platform === "tiktok") {
    // title is optional; the caption rides in `text`.
    return { tiktok: ytTitle ? { title: ytTitle } : {} };
  }
  if (platform === "youtube") {
    // Shorts need a title + category; default privacy public, category 22 = People & Blogs.
    const m: Record<string, unknown> = {
      privacy: "public",
      madeForKids: false,
      categoryId: "22",
    };
    if (ytTitle) m.title = ytTitle;
    return { youtube: m };
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
  if (isReel && /notification|reminder|manual|trending|audio|cannot.*auto|not.*support|unsupported/i.test(first.error)) {
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
    const apiKey = Deno.env.get("BUFFER_API_KEY"); // account A: IG/FB/LI
    if (!apiKey) return json({ error: "BUFFER_API_KEY not configured" }, 500);

    const body = await req.json();
    const { postId, channelIds, apiKeyB: apiKeyBFromBody, action, deleteTargets } = body;

    // account B: TikTok/YouTube — from body (local operator script) or env secret
    const apiKeyB = apiKeyBFromBody ?? Deno.env.get("BUFFER_API_KEY_B") ?? null;
    const keyFor = (p: Platform) => (ACCOUNT_B.includes(p) ? apiKeyB : apiKey);

    // Delete path: POST { action:"delete", deleteTargets:[{ id, account:"A"|"B" }] }
    if (action === "delete") {
      const targets: { id: string; account?: string }[] = deleteTargets ?? [];
      const results = [];
      for (const t of targets) {
        const key = t.account === "B" ? apiKeyB : apiKey;
        if (!key) { results.push({ id: t.id, ok: false, error: "no key for account" }); continue; }
        results.push({ id: t.id, ...(await bufferDelete(key, t.id)) });
      }
      return json({ ok: results.every((r) => r.ok), results });
    }

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

    const channels: Record<Platform, string | undefined> = {
      instagram: channelIds?.instagram ?? Deno.env.get("BUFFER_INSTAGRAM_ID") ?? undefined,
      facebook: channelIds?.facebook ?? Deno.env.get("BUFFER_FACEBOOK_ID") ?? undefined,
      linkedin: channelIds?.linkedin ?? Deno.env.get("BUFFER_LINKEDIN_ID") ?? undefined,
      tiktok: channelIds?.tiktok ?? Deno.env.get("BUFFER_TIKTOK_ID") ?? undefined,
      youtube: channelIds?.youtube ?? Deno.env.get("BUFFER_YOUTUBE_ID") ?? undefined,
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
    const dueAt = post.scheduled_for ? new Date(post.scheduled_for).toISOString() : null;
    const captions = (post.captions ?? {}) as Record<string, string>;
    const ytTitle = captions.youtube_title || post.title || null;

    const bufferIds: Record<string, string> = { ...(post.buffer_post_ids ?? {}) };
    const errors: string[] = [];
    let anyManual = false;
    let anySuccess = false;

    for (const platform of platforms) {
      if (bufferIds[platform]) continue; // already pushed — idempotent re-push
      const channelId = channels[platform];
      if (!channelId) { errors.push(`${platform}: no channel id`); continue; }
      const key = keyFor(platform);
      if (!key) { errors.push(`${platform}: no API key for its Buffer account (apiKeyB missing)`); continue; }

      const text = captions[platform] || post.caption_master || post.caption || "";
      const metadata = metadataFor(platform, contentType, post.first_comment ?? null, ytTitle);

      const r = await createForChannel(key, channelId, text, assets, metadata, dueAt, isReel);
      if (r.ok && r.id) {
        bufferIds[platform] = r.id;
        anySuccess = true;
        if (r.manual) anyManual = true;
      } else {
        errors.push(`${platform}: ${r.error}`);
      }
    }

    const status = !anySuccess && Object.keys(bufferIds).length === 0
      ? "failed"
      : anyManual ? "manual" : "scheduled";
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
