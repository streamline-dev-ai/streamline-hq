export type LeadEngineOffer = "booking_page" | "restaurant_site";
export type OutreachChannel = "whatsapp" | "email" | "ig" | "fb";
export type QueueStatus = "ready" | "sent" | "skipped" | "rejected" | "suppressed";
export type FollowUpStatus = "pending" | "completed" | "cancelled";
export type AgentRole = "lead_researcher" | "outreach_writer" | "reply_analyst";

export type Prospect = {
  id: string;
  lead_id: string | null;
  business_name: string;
  owner_first_name: string | null;
  niche: string;
  suburb: string | null;
  source: string | null;
  status: string;
  offer: LeadEngineOffer;
  channel: OutreachChannel;
  phone_e164: string | null;
  whatsapp_e164: string | null;
  email: string | null;
  website: string | null;
  instagram_handle: string | null;
  facebook_handle: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  lead_temp: string | null;
  popia_optout: boolean;
  created_at: string;
};

export type ProspectQualification = {
  id: string;
  verdict: "qualified" | "review" | "rejected";
  score: number;
  confidence: number | null;
  independent_business: boolean | null;
  active_business: boolean | null;
  website_state: string | null;
  reasons: unknown[];
  warnings: unknown[];
  evidence: unknown[] | Record<string, unknown>;
  source: string;
};

export type DailyQueueItem = {
  id: string;
  queue_date: string;
  prospect_id: string;
  lead_id: string | null;
  qualification_id: string | null;
  offer: LeadEngineOffer;
  channel: OutreachChannel;
  rank: number;
  status: QueueStatus;
  selection_reason: string | null;
  draft_text: string | null;
  final_text: string | null;
  outreach_message_id: string | null;
  acted_at: string | null;
  prospect: Prospect;
  qualification: ProspectQualification | null;
};

export type CrmLead = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  stage: string;
  follow_up_due: string | null;
};

export type OutreachMessage = {
  id: string;
  lead_id: string;
  direction: "inbound" | "outbound";
  message_text: string;
  channel: string | null;
  sent_at: string;
  classification: string | null;
  summary: string | null;
  suggested_reply: string | null;
};

export type FollowUp = {
  id: string;
  lead_id: string;
  queue_item_id: string | null;
  step: number;
  channel: OutreachChannel;
  due_at: string;
  status: FollowUpStatus;
  template_key: string | null;
  draft_text: string | null;
  outreach_message_id: string | null;
  outcome: string | null;
  lead?: Pick<CrmLead, "id" | "business_name" | "phone" | "stage">;
};

export type ReplyClassification =
  | "interested"
  | "staff_response"
  | "question"
  | "not_interested"
  | "stop"
  | "unclassified";

export type QueueAction = "skip" | "reject" | "suppress";
