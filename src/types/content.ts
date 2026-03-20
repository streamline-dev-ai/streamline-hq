export type ContentType = "carousel" | "reel" | "static" | "story";

export type ContentStatus = "idea" | "ready" | "scheduled" | "posted";

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
  content_type: ContentType;
  platforms: Platform[];
  status: ContentStatus;
  scheduled_for: string | null;
  posted_at: string | null;
  content_pillar: ContentPillar;
  hashtags: string | null;
  first_comment: string | null;
  media_urls: string[] | null;
  asset_url: string | null;
  notes: string | null;
  reach: number | null;
  engagement: number | null;
  created_at: string;
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
