import { hq } from "./hq";
import { supabase } from "./supabase";
import { formatZAPhone } from "./phone";
import type {
  CrmLead,
  DailyQueueItem,
  FollowUp,
  OutreachMessage,
  Prospect,
  ProspectQualification,
  QueueAction,
  ReplyClassification,
} from "@/types/leadEngine";

type QueueRow = Omit<DailyQueueItem, "prospect" | "qualification"> & {
  prospects: Prospect | Prospect[] | null;
  prospect_qualifications: ProspectQualification | ProspectQualification[] | null;
};

function singleRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function defaultRestaurantOpener(businessName: string): string {
  void businessName;
  return `Hi, Christiaan here. I was looking for your menu online but couldn't really find anything.

Do you guys have a website or somewhere I could find it?`;
}

export function whatsappUrl(phone: string | null, message: string): string | null {
  const normalized = formatZAPhone(phone ?? "");
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export async function buildDailyQueue(queueDate: string, limit = 20): Promise<number> {
  const { data, error } = await supabase.rpc("build_daily_queue", {
    p_date: queueDate,
    p_limit: limit,
    p_offer: "restaurant_site",
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function loadDailyQueue(queueDate: string): Promise<DailyQueueItem[]> {
  const { data, error } = await hq()
    .from("daily_queue_items")
    .select(
      "*, prospects(*), prospect_qualifications(id,verdict,score,confidence,independent_business,active_business,website_state,reasons,warnings,evidence,source)",
    )
    .eq("queue_date", queueDate)
    .order("rank");
  if (error) throw error;

  const rows: DailyQueueItem[] = [];
  for (const row of (data ?? []) as QueueRow[]) {
      const prospect = singleRelation(row.prospects);
      if (!prospect) continue;
      const {
        prospects: _prospects,
        prospect_qualifications: _qualifications,
        ...queueItem
      } = row;
      rows.push({
        ...queueItem,
        prospect,
        qualification: singleRelation(row.prospect_qualifications),
      });
  }
  return rows;
}

export async function loadProspects(): Promise<Prospect[]> {
  const { data, error } = await hq()
    .from("prospects")
    .select(
      "id,lead_id,business_name,owner_first_name,niche,suburb,source,status,offer,channel,phone_e164,whatsapp_e164,email,website,instagram_handle,facebook_handle,google_rating,google_reviews_count,lead_temp,popia_optout,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Prospect[];
}

export async function recordManualSend(queueItemId: string, finalText: string): Promise<void> {
  const { error } = await supabase.rpc("record_manual_send", {
    p_queue_item_id: queueItemId,
    p_final_text: finalText,
  });
  if (error) throw error;
}

export async function resolveQueueItem(
  queueItemId: string,
  action: QueueAction,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc("resolve_queue_item", {
    p_queue_item_id: queueItemId,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function loadConversations(): Promise<{
  leads: CrmLead[];
  messages: OutreachMessage[];
}> {
  const [leadsResult, messagesResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id,business_name,owner_name,phone,stage,follow_up_due")
      .order("last_contact_at", { ascending: false })
      .limit(300),
    supabase
      .from("outreach_messages")
      .select(
        "id,lead_id,direction,message_text,channel,sent_at,classification,summary,suggested_reply",
      )
      .order("sent_at", { ascending: false })
      .limit(600),
  ]);
  if (leadsResult.error) throw leadsResult.error;
  if (messagesResult.error) throw messagesResult.error;
  return {
    leads: (leadsResult.data ?? []) as CrmLead[],
    messages: (messagesResult.data ?? []).map((message) => ({
      ...message,
      direction:
        message.direction === "received"
          ? "inbound"
          : message.direction === "sent"
            ? "outbound"
            : message.direction,
    })) as OutreachMessage[],
  };
}

export async function recordManualReply(input: {
  leadId: string;
  body: string;
  classification: ReplyClassification;
  summary?: string;
  suggestedReply?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("record_manual_reply", {
    p_lead_id: input.leadId,
    p_body: input.body,
    p_classification: input.classification,
    p_summary: input.summary ?? null,
    p_suggested_reply: input.suggestedReply ?? null,
  });
  if (error) throw error;
}

export async function loadFollowUps(): Promise<FollowUp[]> {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*, leads(id,business_name,phone,stage)")
    .order("due_at", { ascending: true })
    .limit(300);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...(row as FollowUp),
    lead: singleRelation(
      (row as FollowUp & {
        leads:
          | Pick<CrmLead, "id" | "business_name" | "phone" | "stage">
          | Pick<CrmLead, "id" | "business_name" | "phone" | "stage">[]
          | null;
      }).leads,
    ) ?? undefined,
  }));
}

export async function recordManualFollowUp(
  followUpId: string,
  finalText: string,
): Promise<void> {
  const { error } = await supabase.rpc("record_manual_follow_up", {
    p_follow_up_id: followUpId,
    p_final_text: finalText,
  });
  if (error) throw error;
}
