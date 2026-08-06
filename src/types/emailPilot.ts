import type { Prospect } from "./leadEngine";

// One vocabulary per status set, mirrored exactly from
// supabase/migrations/20260804090000_restaurant_email_pilot.sql.
export type PilotChannel = "email" | "instagram" | "facebook";

export type MembershipStatus =
  | "draft"
  | "approved"
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "replied"
  | "handover"
  | "closed_no_response"
  | "suppressed"
  | "manually_reactivated"
  | "skipped";

export type ImportRowStatus = "accepted" | "invalid" | "duplicate" | "suppressed";

export type HandoverReason =
  | "interested"
  | "complaint"
  | "opt_out"
  | "uncertain"
  | "question";

/**
 * Classifications the inbox workflow may send to `ingest_campaign_reply`.
 * Anything in HANDOVER_CLASSIFICATIONS raises a human handover; `stop`
 * additionally suppresses the prospect permanently.
 */
export type PilotReplyClassification =
  | "interested"
  | "question"
  | "complaint"
  | "not_interested"
  | "stop"
  | "unclassified";

export const HANDOVER_CLASSIFICATIONS: PilotReplyClassification[] = [
  "interested",
  "question",
  "complaint",
  "stop",
  "unclassified",
];

export type OutreachCampaign = {
  id: string;
  name: string;
  offer: string;
  channel: PilotChannel;
  sender_identity: string | null;
  sender_display_name: string | null;
  reply_to: string | null;
  signature_footer: string;
  daily_limit: number;
  timezone: string;
  business_start: string;
  business_end: string;
  active: boolean;
  paused_at: string | null;
  pause_reason: string | null;
  created_at: string;
};

export type CampaignMembership = {
  id: string;
  campaign_id: string;
  prospect_id: string;
  lead_id: string | null;
  channel: PilotChannel;
  status: MembershipStatus;
  subject_draft: string | null;
  draft_text: string | null;
  approved_subject: string | null;
  approved_text: string | null;
  approved_version: number | null;
  approved_at: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  last_sent_at: string | null;
  replied_at: string | null;
  follow_up_step: number;
  follow_up_due_at: string | null;
  closed_at: string | null;
  skip_reason: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  prospect?: Prospect;
};

export type OutreachHandover = {
  id: string;
  campaign_membership_id: string | null;
  lead_id: string | null;
  reason: HandoverReason;
  summary: string | null;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
};

export type ImportBatch = {
  id: string;
  source_filename: string | null;
  channel: PilotChannel;
  offer: string;
  campaign_id: string | null;
  total_rows: number;
  accepted_rows: number;
  rejected_rows: number;
  duplicate_rows: number;
  suppressed_rows: number;
  created_at: string;
};

export type ImportRowResult = {
  id: string;
  batch_id: string;
  row_number: number;
  raw_row: Record<string, unknown>;
  normalized_row: Record<string, unknown> | null;
  status: ImportRowStatus;
  issues: string[];
  prospect_id: string | null;
};

/** A row of `public.outreach_messages` scoped to a pilot thread. */
export type PilotMessage = {
  id: string;
  lead_id: string | null;
  campaign_membership_id: string | null;
  direction: "inbound" | "outbound";
  subject: string | null;
  message_text: string | null;
  sent_at: string;
  classification: string | null;
  summary: string | null;
  delivery_status: string | null;
  provider_message_id: string | null;
  provider_thread_id: string | null;
};

/** Parsed + validated CSV row, before it is written to the database. */
export type NormalizedImportRow = {
  business_name: string;
  email: string;
  owner_first_name: string | null;
  suburb: string | null;
  phone_e164: string | null;
  website: string | null;
  instagram_handle: string | null;
  facebook_handle: string | null;
  niche: string;
};

export type ImportRowOutcome = {
  row_number: number;
  status: ImportRowStatus;
  issues: string[];
  business_name: string | null;
  email: string | null;
};

export type ImportSummary = {
  batch_id: string | null;
  total: number;
  accepted: number;
  invalid: number;
  duplicate: number;
  suppressed: number;
  rows: ImportRowOutcome[];
};

export const MEMBERSHIP_STATUS_META: Record<
  MembershipStatus,
  { label: string; tone: "neutral" | "brand" | "accent" | "success" | "danger" | "warn" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  approved: { label: "Approved", tone: "brand" },
  scheduled: { label: "Scheduled", tone: "brand" },
  sending: { label: "Sending", tone: "warn" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  replied: { label: "Replied", tone: "accent" },
  handover: { label: "Handover", tone: "accent" },
  closed_no_response: { label: "Closed", tone: "neutral" },
  suppressed: { label: "Suppressed", tone: "danger" },
  manually_reactivated: { label: "Reactivated", tone: "warn" },
  skipped: { label: "Skipped", tone: "neutral" },
};

export const HANDOVER_REASON_META: Record<
  HandoverReason,
  { label: string; tone: "brand" | "accent" | "danger" | "warn" }
> = {
  interested: { label: "Interested", tone: "brand" },
  question: { label: "Question", tone: "accent" },
  complaint: { label: "Complaint", tone: "danger" },
  opt_out: { label: "Opt-out", tone: "danger" },
  uncertain: { label: "Uncertain", tone: "warn" },
};
