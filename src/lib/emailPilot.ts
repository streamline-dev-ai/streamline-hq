import { hq } from "./hq";
import { supabase } from "./supabase";
import { pick, slugify, validateRow } from "./emailPilotCsv";
import type { Prospect } from "@/types/leadEngine";
import type {
  CampaignMembership,
  ImportBatch,
  ImportRowOutcome,
  ImportSummary,
  NormalizedImportRow,
  OutreachCampaign,
  OutreachHandover,
  PilotMessage,
} from "@/types/emailPilot";

const MEMBERSHIP_COLUMNS =
  "id,campaign_id,prospect_id,lead_id,channel,status,subject_draft,draft_text,approved_subject,approved_text,approved_version,approved_at,scheduled_for,sent_at,last_sent_at,replied_at,follow_up_step,follow_up_due_at,closed_at,skip_reason,last_error,created_at,updated_at";

const PROSPECT_COLUMNS =
  "id,lead_id,business_name,owner_first_name,niche,suburb,source,status,offer,channel,phone_e164,whatsapp_e164,email,website,instagram_handle,facebook_handle,google_rating,google_reviews_count,lead_temp,popia_optout,created_at";

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ------------------------------------------------------------------ drafts

/**
 * Starting point for a cold email — compliment-led, short, and honest about
 * what is being offered. Always edited and approved by a human before it can
 * be scheduled. The opt-out footer is NOT included here: the sender appends
 * `campaign.signature_footer` so it can never be edited away by accident.
 */
export function defaultRestaurantEmail(prospect: Pick<Prospect, "business_name" | "owner_first_name" | "suburb">): {
  subject: string;
  body: string;
} {
  const greeting = prospect.owner_first_name ? `Hi ${prospect.owner_first_name},` : "Hi there,";
  const place = prospect.suburb ? ` in ${prospect.suburb}` : "";
  return {
    subject: `A website idea for ${prospect.business_name}`,
    body: `${greeting}

I came across ${prospect.business_name}${place} and the food looks genuinely good — but I struggled to find a proper menu or site online.

I build simple restaurant websites: menu, photos, hours, directions, and a click-to-call button. R699 a month, three-month minimum, and I do the whole build for you.

Worth a quick look? I can put a free mock-up together so you can see it with your own photos first.

Christiaan
Streamline Automations`,
  };
}

/** Draft for a follow-up on an unanswered thread. */
export function defaultFollowUpEmail(
  prospect: Pick<Prospect, "business_name">,
  step: number,
): { subject: string; body: string } {
  if (step <= 1) {
    return {
      subject: `Re: A website idea for ${prospect.business_name}`,
      body: `Hi again,

Just floating this back to the top of your inbox in case it got buried.

Happy to send the free mock-up over so you can see what ${prospect.business_name} would look like — no obligation either way.

Christiaan`,
    };
  }
  return {
    subject: `Re: A website idea for ${prospect.business_name}`,
    body: `Hi,

Last note from me on this one — I don't want to clutter your inbox.

If a website for ${prospect.business_name} is ever on the list, I'm here.

Christiaan`,
  };
}

// ---------------------------------------------------------------- campaigns

export async function loadCampaigns(): Promise<OutreachCampaign[]> {
  const { data, error } = await hq()
    .from("outreach_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OutreachCampaign[];
}

/** Campaigns are always created inactive. Activation is a deliberate manual step. */
export async function createCampaign(input: {
  name: string;
  senderIdentity: string;
  senderDisplayName: string;
  replyTo: string;
  dailyLimit?: number;
}): Promise<OutreachCampaign> {
  const { data, error } = await hq()
    .from("outreach_campaigns")
    .insert({
      name: input.name,
      channel: "email",
      offer: "restaurant_site",
      sender_identity: input.senderIdentity,
      sender_display_name: input.senderDisplayName,
      reply_to: input.replyTo,
      daily_limit: input.dailyLimit ?? 5,
      active: false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as OutreachCampaign;
}

/**
 * Turns sending on or off. Activating also clears any pause.
 *
 * Approving and scheduling work while inactive — they only queue. This flag is
 * what `claim_due_campaign_send` checks before a single email can leave.
 */
export async function setCampaignActive(
  campaignId: string,
  active: boolean,
): Promise<void> {
  const { error } = await hq()
    .from("outreach_campaigns")
    .update(
      active
        ? { active: true, paused_at: null, pause_reason: null, updated_at: new Date().toISOString() }
        : { active: false, updated_at: new Date().toISOString() },
    )
    .eq("id", campaignId);
  if (error) throw error;
}

export async function pauseCampaign(campaignId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("pause_outreach_campaign", {
    p_campaign_id: campaignId,
    p_reason: reason || null,
  });
  if (error) throw error;
}

// -------------------------------------------------------------- memberships

export async function loadMemberships(campaignId: string): Promise<CampaignMembership[]> {
  const { data, error } = await hq()
    .from("campaign_memberships")
    .select(`${MEMBERSHIP_COLUMNS}, prospects(${PROSPECT_COLUMNS})`)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as (CampaignMembership & {
    prospects: Prospect | Prospect[] | null;
  })[]).map((row) => {
    const { prospects, ...membership } = row;
    return { ...membership, prospect: singleRelation(prospects) ?? undefined };
  });
}

export async function approveMessage(
  membershipId: string,
  subject: string,
  body: string,
): Promise<void> {
  const { error } = await supabase.rpc("approve_campaign_message", {
    p_membership_id: membershipId,
    p_subject: subject,
    p_body: body,
  });
  if (error) throw error;
}

export async function scheduleMessage(
  membershipId: string,
  scheduledFor: Date,
): Promise<void> {
  const { error } = await supabase.rpc("schedule_campaign_message", {
    p_membership_id: membershipId,
    p_scheduled_for: scheduledFor.toISOString(),
  });
  if (error) throw error;
}

/**
 * Approve then schedule. The sender only ever picks up `scheduled` rows, so an
 * approval that is not followed by a schedule is inert by design.
 */
export async function approveAndSchedule(
  membershipId: string,
  subject: string,
  body: string,
  scheduledFor: Date,
): Promise<void> {
  await approveMessage(membershipId, subject, body);
  await scheduleMessage(membershipId, scheduledFor);
}

export async function skipMember(membershipId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("skip_campaign_member", {
    p_membership_id: membershipId,
    p_reason: reason || null,
  });
  if (error) throw error;
}

export async function suppressProspect(prospectId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("suppress_campaign_prospect", {
    p_prospect_id: prospectId,
    p_reason: reason || "manual_optout",
  });
  if (error) throw error;
}

/** Re-enters the approval path; it never sends on its own. */
export async function queueFollowUp(input: {
  membershipId: string;
  subject?: string;
  body?: string;
  businessDays?: number;
}): Promise<void> {
  const { error } = await supabase.rpc("queue_campaign_follow_up", {
    p_membership_id: input.membershipId,
    p_subject_draft: input.subject ?? null,
    p_draft_text: input.body ?? null,
    p_business_days: input.businessDays ?? 3,
  });
  if (error) throw error;
}

export async function reactivateMember(
  membershipId: string,
  reason: string,
  newCampaignId: string,
): Promise<void> {
  const { error } = await supabase.rpc("manually_reactivate_campaign_member", {
    p_membership_id: membershipId,
    p_reason: reason,
    p_new_campaign_id: newCampaignId,
  });
  if (error) throw error;
}

// --------------------------------------------------------------- handovers

export async function loadHandovers(): Promise<OutreachHandover[]> {
  const { data, error } = await hq()
    .from("outreach_handovers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as OutreachHandover[];
}

export async function resolveHandover(handoverId: string): Promise<void> {
  const { error } = await supabase.rpc("resolve_outreach_handover", {
    p_handover_id: handoverId,
  });
  if (error) throw error;
}

// ----------------------------------------------------------------- threads

export async function loadThreadMessages(
  membershipIds: string[],
): Promise<PilotMessage[]> {
  if (membershipIds.length === 0) return [];
  const { data, error } = await supabase
    .from("outreach_messages")
    .select(
      "id,lead_id,campaign_membership_id,direction,subject,message_text,sent_at,classification,summary,delivery_status,provider_message_id,provider_thread_id",
    )
    .in("campaign_membership_id", membershipIds)
    .order("sent_at", { ascending: true });
  if (error) throw error;
  // `outreach_messages.direction` still accepts the legacy sent/received pair.
  return ((data ?? []) as (Omit<PilotMessage, "direction"> & { direction: string })[]).map(
    (message) => ({
      ...message,
      direction: message.direction === "inbound" || message.direction === "received"
        ? ("inbound" as const)
        : ("outbound" as const),
    }),
  );
}

// ------------------------------------------------------------------ import

export { parseSpreadsheet, validateRow } from "./emailPilotCsv";

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const { data, error } = await hq()
      .from("prospects")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Imports a spreadsheet into a campaign.
 *
 * Every row is handled independently: a row that throws is recorded as invalid
 * and the run continues, so a single bad row can never discard the good ones.
 */
export async function importProspects(input: {
  campaignId: string;
  filename: string;
  rows: Record<string, string>[];
}): Promise<ImportSummary> {
  const { campaignId, filename, rows } = input;

  const { data: batch, error: batchError } = await hq()
    .from("import_batches")
    .insert({
      source_filename: filename,
      channel: "email",
      offer: "restaurant_site",
      campaign_id: campaignId,
      total_rows: rows.length,
    })
    .select("id")
    .single();
  if (batchError) throw batchError;
  const batchId = (batch as { id: string }).id;

  const outcomes: ImportRowOutcome[] = [];
  const seenEmails = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 1;
    const raw = rows[index];
    let outcome: ImportRowOutcome;
    let prospectId: string | null = null;
    let normalized: NormalizedImportRow | null = null;

    try {
      const validated = validateRow(raw);
      normalized = validated.normalized;

      if (!normalized) {
        outcome = {
          row_number: rowNumber,
          status: "invalid",
          issues: validated.issues,
          business_name: pick(raw, "business_name") || null,
          email: pick(raw, "email") || null,
        };
      } else if (seenEmails.has(normalized.email)) {
        outcome = {
          row_number: rowNumber,
          status: "duplicate",
          issues: ["Duplicate of an earlier row in this file"],
          business_name: normalized.business_name,
          email: normalized.email,
        };
      } else {
        seenEmails.add(normalized.email);

        const { data: existing, error: existingError } = await hq()
          .from("prospects")
          .select("id,popia_optout")
          .ilike("email", normalized.email)
          .limit(1)
          .maybeSingle();
        if (existingError) throw existingError;

        let suppressed = Boolean(existing?.popia_optout);
        if (existing && !suppressed) {
          const { data: suppression, error: suppressionError } = await hq()
            .from("suppression_list")
            .select("id")
            .eq("prospect_id", existing.id)
            .limit(1)
            .maybeSingle();
          if (suppressionError) throw suppressionError;
          suppressed = Boolean(suppression);
        }

        if (suppressed && existing) {
          prospectId = existing.id;
          outcome = {
            row_number: rowNumber,
            status: "suppressed",
            issues: ["Contact is on the suppression list and was not queued"],
            business_name: normalized.business_name,
            email: normalized.email,
          };
        } else {
          if (existing) {
            prospectId = existing.id;
          } else {
            const slug = await uniqueSlug(slugify(normalized.business_name));
            const { data: inserted, error: insertError } = await hq()
              .from("prospects")
              .insert({
                source: "manual",
                business_name: normalized.business_name,
                slug,
                niche: normalized.niche,
                suburb: normalized.suburb,
                email: normalized.email,
                phone_e164: normalized.phone_e164,
                website: normalized.website,
                instagram_handle: normalized.instagram_handle,
                facebook_handle: normalized.facebook_handle,
                owner_first_name: normalized.owner_first_name,
                offer: "restaurant_site",
                channel: "email",
              })
              .select("id")
              .single();
            if (insertError) throw insertError;
            prospectId = (inserted as { id: string }).id;
          }

          const { data: alreadyMember, error: memberError } = await hq()
            .from("campaign_memberships")
            .select("id")
            .eq("campaign_id", campaignId)
            .eq("prospect_id", prospectId)
            .limit(1)
            .maybeSingle();
          if (memberError) throw memberError;

          if (alreadyMember) {
            outcome = {
              row_number: rowNumber,
              status: "duplicate",
              issues: ["Already a member of this campaign"],
              business_name: normalized.business_name,
              email: normalized.email,
            };
          } else {
            const { error: rpcError } = await supabase.rpc("create_campaign_membership", {
              p_campaign_id: campaignId,
              p_prospect_id: prospectId,
              p_draft_text: null,
              p_subject_draft: null,
            });
            if (rpcError) throw rpcError;
            outcome = {
              row_number: rowNumber,
              status: "accepted",
              issues: [],
              business_name: normalized.business_name,
              email: normalized.email,
            };
          }
        }
      }
    } catch (rowError) {
      const message =
        rowError instanceof Error ? rowError.message : "Unknown error importing row";
      // The guarded RPC raises on suppression; classify that correctly rather
      // than reporting it as a malformed row.
      const isSuppression = /suppress/i.test(message);
      outcome = {
        row_number: rowNumber,
        status: isSuppression ? "suppressed" : "invalid",
        issues: [message],
        business_name: normalized?.business_name ?? (pick(raw, "business_name") || null),
        email: normalized?.email ?? (pick(raw, "email") || null),
      };
    }

    outcomes.push(outcome);

    // Result logging must never take the import down with it.
    try {
      await hq()
        .from("import_row_results")
        .insert({
          batch_id: batchId,
          row_number: rowNumber,
          raw_row: raw,
          normalized_row: normalized,
          status: outcome.status,
          issues: outcome.issues,
          prospect_id: prospectId,
        });
    } catch {
      /* row already reflected in the returned summary */
    }
  }

  const summary: ImportSummary = {
    batch_id: batchId,
    total: rows.length,
    accepted: outcomes.filter((o) => o.status === "accepted").length,
    invalid: outcomes.filter((o) => o.status === "invalid").length,
    duplicate: outcomes.filter((o) => o.status === "duplicate").length,
    suppressed: outcomes.filter((o) => o.status === "suppressed").length,
    rows: outcomes,
  };

  await hq()
    .from("import_batches")
    .update({
      accepted_rows: summary.accepted,
      rejected_rows: summary.invalid,
      duplicate_rows: summary.duplicate,
      suppressed_rows: summary.suppressed,
    })
    .eq("id", batchId);

  return summary;
}

export async function loadImportBatches(): Promise<ImportBatch[]> {
  const { data, error } = await hq()
    .from("import_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ImportBatch[];
}

// ------------------------------------------------------------------ social

/** Instagram/Facebook prospects are researched here but always sent by hand. */
export async function loadSocialQueue(): Promise<Prospect[]> {
  const { data, error } = await hq()
    .from("prospects")
    .select(PROSPECT_COLUMNS)
    .eq("offer", "restaurant_site")
    .eq("popia_optout", false)
    .or("instagram_handle.not.is.null,facebook_handle.not.is.null")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Prospect[];
}

export function socialProfileUrl(
  handle: string | null,
  platform: "instagram" | "facebook",
): string | null {
  if (!handle) return null;
  const trimmed = handle.trim().replace(/^@/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return platform === "instagram"
    ? `https://instagram.com/${trimmed}`
    : `https://facebook.com/${trimmed}`;
}

/**
 * Logs a manual Instagram/Facebook send into the same lead history the email
 * pilot writes to, so social and email share one timeline.
 */
export async function logSocialSend(input: {
  prospectId: string;
  platform: "instagram" | "facebook";
  body: string;
}): Promise<void> {
  const { data: prospect, error: prospectError } = await hq()
    .from("prospects")
    .select("id,lead_id")
    .eq("id", input.prospectId)
    .single();
  if (prospectError) throw prospectError;

  let leadId = (prospect as { lead_id: string | null }).lead_id;
  if (!leadId) {
    const { data: promoted, error: promoteError } = await supabase.rpc(
      "promote_prospect_to_lead",
      { p_prospect_id: input.prospectId },
    );
    if (promoteError) throw promoteError;
    leadId = promoted as string;
  }

  const { error } = await supabase.from("outreach_messages").insert({
    lead_id: leadId,
    direction: "outbound",
    message_text: input.body,
    channel: input.platform === "instagram" ? "ig" : "fb",
    sent_at: new Date().toISOString(),
    replied: false,
    delivery_status: "sent",
    metadata: { source: "manual_social_send", platform: input.platform },
  });
  if (error) throw error;
}

// ------------------------------------------------------------------ report

export type WeeklyReport = {
  since: string;
  imported: number;
  approved: number;
  sent: number;
  replied: number;
  handovers: number;
  optOuts: number;
  failures: number;
};

export async function loadWeeklyReport(): Promise<WeeklyReport> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  const [memberships, handovers, messages] = await Promise.all([
    hq()
      .from("campaign_memberships")
      .select("status,approved_at,last_sent_at,replied_at,created_at")
      .gte("created_at", sinceIso),
    hq().from("outreach_handovers").select("reason,created_at").gte("created_at", sinceIso),
    supabase
      .from("outreach_messages")
      .select("direction,sent_at")
      .eq("channel", "email")
      .gte("sent_at", sinceIso),
  ]);
  if (memberships.error) throw memberships.error;
  if (handovers.error) throw handovers.error;
  if (messages.error) throw messages.error;

  const rows = (memberships.data ?? []) as {
    status: string;
    approved_at: string | null;
    last_sent_at: string | null;
    replied_at: string | null;
  }[];
  const handoverRows = (handovers.data ?? []) as { reason: string }[];
  const messageRows = (messages.data ?? []) as { direction: string }[];

  return {
    since: sinceIso,
    imported: rows.length,
    approved: rows.filter((r) => r.approved_at).length,
    sent: messageRows.filter((m) => m.direction === "outbound" || m.direction === "sent")
      .length,
    replied: messageRows.filter((m) => m.direction === "inbound" || m.direction === "received")
      .length,
    handovers: handoverRows.length,
    optOuts: handoverRows.filter((h) => h.reason === "opt_out").length,
    failures: rows.filter((r) => r.status === "failed").length,
  };
}
