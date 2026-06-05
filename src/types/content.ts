export type ContentType = "carousel" | "reel" | "static" | "story";

// ── Canonical post-status vocabulary ──────────────────────────────────────
// ONE source of truth. Every insert path (Create tab, ingestion script,
// edge functions) imports this. The DB is intentionally permissive (no CHECK),
// so consistency lives here, not in Postgres.
export type PostStatus =
  | "draft"      // being worked on
  | "queued"     // ready, fed from a folder/ingestion, not yet pushed
  | "scheduled"  // accepted by Buffer (auto-publish)
  | "published"  // live
  | "failed"     // Buffer rejected it
  | "manual";    // Buffer needs a phone reminder (e.g. reel/trending-audio) — handle by hand

export const POST_STATUSES: PostStatus[] = [
  "draft", "queued", "scheduled", "published", "failed", "manual",
];

export const POST_STATUS_META: Record<
  PostStatus,
  { label: string; badge: "default" | "purple" | "orange" | "blue" | "zinc" | "emerald" | "teal" }
> = {
  draft:     { label: "Draft",     badge: "zinc" },
  queued:    { label: "Queued",    badge: "blue" },
  scheduled: { label: "Scheduled", badge: "purple" },
  published: { label: "Published", badge: "emerald" },
  failed:    { label: "Failed",    badge: "orange" },
  manual:    { label: "Manual",    badge: "teal" },
};

// Legacy values that may still exist in older rows → canonical.
export function normalizeStatus(raw: string | null | undefined): PostStatus {
  switch (raw) {
    case "idea": return "draft";
    case "ready": return "queued";
    case "posted": return "published";
    default:
      return (POST_STATUSES as string[]).includes(raw ?? "") ? (raw as PostStatus) : "draft";
  }
}

/** @deprecated use PostStatus — kept only so old imports don't break */
export type ContentStatus = PostStatus;

export type ContentPillar =
  | "Build in Public"
  | "Before/After"
  | "Problem/Solution"
  | "Featured Build"
  | "Offer"
  | "Tip"
  | "Social Proof";

export type Platform = "instagram" | "facebook" | "linkedin";

export interface ContentPost {
  id: string;
  title: string;
  brief: string | null;
  caption: string | null;
  captions: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
  } | null;
  caption_master: string | null;
  content_type: ContentType;
  platforms: Platform[];
  status: PostStatus;
  scheduled_for: string | null;
  posted_at: string | null;
  content_pillar: ContentPillar;
  hashtags: string | null;
  first_comment: string | null;
  media_urls: string[] | null;
  asset_url: string | null;
  notes: string | null;
  source_folder: string | null;
  error: string | null;
  reach: number | null;
  engagement: number | null;
  created_at: string;
  buffer_post_ids: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
  } | null;
}

export interface ContentIdea {
  id: string;
  title: string;
  hook: string | null;
  brief: string | null;
  pillar: ContentPillar;
  content_type: ContentType;
  platforms: Platform[];
  notes: string | null;
  used: boolean;
  scheduled_for?: string;
  created_at: string;
}
