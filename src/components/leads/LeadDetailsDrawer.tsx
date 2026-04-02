import { useEffect, useMemo, useState } from "react";
import { formatZAPhone } from "@/lib/phone";
import { Clipboard, ExternalLink, Mail, Phone, X, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast/ToastProvider";
import { useLeadContextStore, type LeadContext } from "@/stores/leadContext";
import { getSaDateString, daysBetweenSaYmd } from "@/utils/saDate";

type LeadRow = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  niche: string | null;
  language?: string | null;
  is_client: boolean | null;
  follow_up_due: string | null;
  follow_up_type: string | null;
  stage: string | null;
  last_contact_at: string | null;
  demo_url: string | null;
  notes: string | null;
};

type OutreachMessageRow = {
  id: string;
  direction: "sent" | "received" | string | null;
  message_text: string | null;
  template_id: string | null;
  sent_at: string | null;
};

type StageEventRow = {
  id: string;
  from_stage: string | null;
  to_stage: string;
  changed_at: string;
};


function formatStageLabel(stage: string | null) {
  const s = (stage ?? "new").toLowerCase();
  return s.replace(/_/g, " ");
}

function followUpLabel(t: string | null) {
  const k = (t ?? "").toLowerCase();
  if (k === "demo_check_in") return "Demo check-in";
  if (k === "no_reply_check") return "No reply check";
  if (k === "proposal_follow_up") return "Proposal follow-up";
  return t ? t.replace(/_/g, " ") : "—";
}

type DrawerTab = "details" | "messages";

type NicheOption = "electrical" | "plumbing" | "pest control" | "solar" | "aircon" | "handyman" | "restaurant" | "other";

const NICHES: NicheOption[] = ["electrical", "plumbing", "pest control", "solar", "aircon", "handyman", "restaurant", "other"];

type LeadLanguage = "english" | "afrikaans";

export default function LeadDetailsDrawer({
  lead,
  open,
  onClose,
  initialTab = "details",
  languageEnabled = true,
}: {
  lead: LeadRow | null;
  open: boolean;
  onClose: () => void;
  initialTab?: DrawerTab;
  languageEnabled?: boolean;
}) {
  const { pushToast } = useToast();
  const setActiveLead = useLeadContextStore((s) => s.setActiveLead);
  const [messages, setMessages] = useState<OutreachMessageRow[]>([]);
  const [events, setEvents] = useState<StageEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [newDirection, setNewDirection] = useState<"sent" | "received">("sent");
  const [newText, setNewText] = useState("");
  const [savingMessage, setSavingMessage] = useState(false);
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [savingContact, setSavingContact] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<string>("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [languageValue, setLanguageValue] = useState<LeadLanguage>("english");
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [nicheValue, setNicheValue] = useState<NicheOption>("electrical");
  const [savingNiche, setSavingNiche] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const leadContext: LeadContext | null = useMemo(() => {
    if (!lead) return null;
    return {
      id: lead.id,
      business_name: lead.business_name,
      owner_name: lead.owner_name,
      demo_url: lead.demo_url,
      niche: lead.niche,
      stage: lead.stage,
    };
  }, [lead]);

  useEffect(() => {
    if (!open) return;
    setActiveLead(leadContext);
    return () => {
      setActiveLead(null);
    };
  }, [leadContext, open, setActiveLead]);

  useEffect(() => {
    if (!open || !lead) return;
    setLoading(true);
    Promise.all([
      supabase.from("outreach_messages").select("id, direction, message_text, template_id, sent_at").eq("lead_id", lead.id).order("sent_at", { ascending: true }),
      supabase.from("lead_stage_events").select("id, from_stage, to_stage, changed_at").eq("lead_id", lead.id).order("changed_at", { ascending: true }),
    ])
      .then(([m, e]) => {
        if (m.error) throw m.error;
        if (e.error) throw e.error;
        setMessages((m.data ?? []) as OutreachMessageRow[]);
        setEvents((e.data ?? []) as StageEventRow[]);
        setNewText("");
        setNewDirection("sent");
        setTab(initialTab);
        setFollowUpDate(lead.follow_up_due ?? "");
        const raw = (lead.niche ?? "electrical").toLowerCase();
        setNicheValue((NICHES as unknown as string[]).includes(raw) ? (raw as NicheOption) : "other");
        setNotesValue((lead.notes ?? "").trim());
        if (languageEnabled) {
          const langRaw = (lead.language ?? "english").toLowerCase();
          setLanguageValue(langRaw === "afrikaans" ? "afrikaans" : "english");
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load lead details";
        pushToast({ type: "error", title: "Lead details", message: msg });
      })
      .finally(() => setLoading(false));
  }, [languageEnabled, lead, open, pushToast]);

  async function toggleClient() {
    if (!lead) return;
    setSavingClient(true);
    try {
      const next = !(lead.is_client === true);
      const r = await supabase.from("leads").update({ is_client: next }).eq("id", lead.id);
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Updated", message: next ? "Moved to Clients" : "Moved to Active leads" });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update client status";
      pushToast({ type: "error", title: "Client status", message: msg });
    } finally {
      setSavingClient(false);
    }
  }

  async function logContact() {
    if (!lead) return;
    setSavingContact(true);
    try {
      const nowIso = new Date().toISOString();
      const r = await supabase.from("leads").update({ last_contact_at: nowIso }).eq("id", lead.id);
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Logged", message: "Contact time updated" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to log contact";
      pushToast({ type: "error", title: "Log contact", message: msg });
    } finally {
      setSavingContact(false);
    }
  }

  async function copyOpener() {
    if (!lead) return;
    const owner = (lead.owner_name ?? "").trim();
    const msg = owner
      ? `Hi, is this ${owner} from ${lead.business_name}? 👋`
      : `Hi, is this the owner of ${lead.business_name}? 👋`;
    try {
      await navigator.clipboard.writeText(msg);
      pushToast({ type: "success", title: "Copied", message: "Opener copied" });
    } catch {
      pushToast({ type: "error", title: "Copy", message: "Clipboard access was blocked" });
    }
  }

  async function saveFollowUp(next: string) {
    if (!lead) return;
    setSavingFollowUp(true);
    try {
      const r = await supabase.from("leads").update({ follow_up_due: next || null }).eq("id", lead.id);
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Follow-up", message: next ? "Scheduled" : "Cleared" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update follow-up";
      pushToast({ type: "error", title: "Follow-up", message: msg });
    } finally {
      setSavingFollowUp(false);
    }
  }

  async function saveNiche(next: NicheOption) {
    if (!lead) return;
    setSavingNiche(true);
    try {
      const r = await supabase.from("leads").update({ niche: next }).eq("id", lead.id);
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Niche", message: "Updated" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update niche";
      pushToast({ type: "error", title: "Niche", message: msg });
    } finally {
      setSavingNiche(false);
    }
  }

  async function saveLanguage(next: LeadLanguage) {
    if (!lead) return;
    if (!languageEnabled) return;
    setSavingLanguage(true);
    try {
      const r = await supabase.from("leads").update({ language: next }).eq("id", lead.id);
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Language", message: "Updated" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update language";
      pushToast({ type: "error", title: "Language", message: msg });
    } finally {
      setSavingLanguage(false);
    }
  }

  async function saveNotes(next: string) {
    if (!lead) return;
    setSavingNotes(true);
    try {
      const cleaned = next.trim();
      const r = await supabase.from("leads").update({ notes: cleaned || null }).eq("id", lead.id);
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Notes", message: "Saved" });
      setNotesValue(cleaned);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save notes";
      pushToast({ type: "error", title: "Notes", message: msg });
    } finally {
      setSavingNotes(false);
    }
  }

  async function deleteLead() {
    if (!lead) return;
    if (!confirm("Are you sure you want to delete this lead?")) return;
    setDeleting(true);
    try {
      const r = await supabase.from("leads").delete().eq("id", lead.id);
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Deleted", message: "Lead removed" });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete lead";
      pushToast({ type: "error", title: "Delete", message: msg });
    } finally {
      setDeleting(false);
    }
  }

  async function addMessage() {
    if (!lead) return;
    const text = newText.trim();
    if (!text) return;
    setSavingMessage(true);
    try {
      const nowIso = new Date().toISOString();
      const r = await supabase.from("outreach_messages").insert({
        lead_id: lead.id,
        direction: newDirection,
        message_text: text,
        template_id: null,
        sent_at: nowIso,
        replied: false,
      });
      if (r.error) throw r.error;
      setNewText("");
      pushToast({ type: "success", title: "Saved", message: "Message added" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save message";
      pushToast({ type: "error", title: "Message", message: msg });
    } finally {
      setSavingMessage(false);
    }
  }

  useEffect(() => {
    if (!open || !lead) return;
    const channel = supabase
      .channel(`lead-details-${lead.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "outreach_messages", filter: `lead_id=eq.${lead.id}` }, () => {
        supabase
          .from("outreach_messages")
          .select("id, direction, message_text, template_id, sent_at")
          .eq("lead_id", lead.id)
          .order("sent_at", { ascending: true })
          .then((r) => {
            if (r.data) setMessages(r.data as OutreachMessageRow[]);
          });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_stage_events", filter: `lead_id=eq.${lead.id}` }, () => {
        supabase
          .from("lead_stage_events")
          .select("id, from_stage, to_stage, changed_at")
          .eq("lead_id", lead.id)
          .order("changed_at", { ascending: true })
          .then((r) => {
            if (r.data) setEvents(r.data as StageEventRow[]);
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lead, open]);

  const phone = lead?.phone ? formatZAPhone(lead.phone) : "";
  const altPhone = lead?.alt_phone ? formatZAPhone(lead.alt_phone) : "";
  const wa = phone ? `https://wa.me/${phone}` : null;
  const waAlt = altPhone ? `https://wa.me/${altPhone}` : null;
  const today = getSaDateString();
  const overdueDays = lead?.follow_up_due ? daysBetweenSaYmd(today, lead.follow_up_due) : null;

  async function copyDemoLink() {
    const url = lead?.demo_url?.trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1500);
    } catch {
      pushToast({ type: "error", title: "Copy", message: "Clipboard access was blocked" });
    }
  }

  return (
    <div className={cn("fixed inset-0 z-40", open ? "pointer-events-auto" : "pointer-events-none")}>
      <div onClick={onClose} className={cn("absolute inset-0 bg-black/60 transition-opacity", open ? "opacity-100" : "opacity-0")} />

      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 mx-auto flex max-h-[calc(100dvh-16px)] w-full max-w-[980px] flex-col overflow-hidden rounded-t-3xl border border-border bg-panel p-4 transition-transform",
          "pb-[calc(env(safe-area-inset-bottom)+16px)]",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-zinc-100">{lead?.business_name ?? "Lead"}</div>
            <div className="mt-1 text-sm text-zinc-400">{lead?.owner_name ? lead.owner_name : "No owner name"}</div>
          </div>
          <button
            type="button"
            onClick={deleteLead}
            disabled={deleting}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
            title="Delete lead"
          >
            <Trash2 className={cn("h-4 w-4", deleting && "animate-pulse")} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-base/40 text-zinc-200 hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="mt-4 rounded-2xl border border-border bg-base/40 p-4 text-sm text-zinc-400">Loading…</div>
          ) : !lead ? null : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTab("details")}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-semibold",
                    tab === "details" ? "border-purple/30 bg-purple/15 text-purple" : "border-border bg-base/40 text-zinc-200 hover:bg-white/5",
                  )}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setTab("messages")}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-semibold",
                    tab === "messages" ? "border-purple/30 bg-purple/15 text-purple" : "border-border bg-base/40 text-zinc-200 hover:bg-white/5",
                  )}
                >
                  Messages
                </button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-3">
                <div className="rounded-2xl border border-border bg-base/40 p-3">
                  <div className="text-xs text-zinc-400">Contact</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
                      >
                        <Phone className="h-4 w-4" />
                        {phone}
                      </a>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-zinc-500">
                        <Phone className="h-4 w-4" />
                        No phone
                      </div>
                    )}
                    {waAlt ? (
                      <a
                        href={waAlt}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
                        title="Alternative number"
                      >
                        <Phone className="h-4 w-4 opacity-60" />
                        {altPhone}
                      </a>
                    ) : null}
                    {lead.email ? (
                      <a
                        href={`mailto:${lead.email}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
                      >
                        <Mail className="h-4 w-4" />
                        Email
                      </a>
                    ) : null}
                    {lead.demo_url ? (
                      <a
                        href={lead.demo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Demo
                      </a>
                    ) : null}
                    {lead.demo_url ? (
                      <button
                        type="button"
                        onClick={() => void copyDemoLink()}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                          copiedLink ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" : "border-border bg-panel text-zinc-100 hover:bg-white/5",
                        )}
                      >
                        <Clipboard className="h-4 w-4" />
                        {copiedLink ? "Copied" : "Copy link"}
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-2 text-sm">
                    <button
                      type="button"
                      disabled={savingContact}
                      onClick={() => void logContact()}
                      className={cn(
                        "inline-flex items-center justify-center rounded-xl border border-border bg-panel px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/5",
                        savingContact && "opacity-60",
                      )}
                    >
                      Log contact
                    </button>

                    <button
                      type="button"
                      onClick={() => void copyOpener()}
                      className="inline-flex items-center justify-center rounded-xl border border-border bg-panel px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/5"
                    >
                      Copy opener
                    </button>

                    <button
                      type="button"
                      disabled={savingClient}
                      onClick={() => void toggleClient()}
                      className={cn(
                        "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold",
                        lead.is_client
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                          : "border-border bg-panel text-zinc-100 hover:bg-white/5",
                        savingClient && "opacity-60",
                      )}
                    >
                      {lead.is_client ? "Client (tap to move back)" : "Mark as client"}
                    </button>

                    <div className="grid gap-1 rounded-2xl border border-border bg-panel p-3">
                      <div className="text-xs text-zinc-400">Follow-up date</div>
                      <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="date"
                          value={followUpDate}
                          onChange={(e) => setFollowUpDate(e.target.value)}
                          className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                        />
                        <button
                          type="button"
                          disabled={savingFollowUp}
                          onClick={() => void saveFollowUp(followUpDate)}
                          className={cn(
                            "rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-black hover:brightness-110",
                            savingFollowUp && "opacity-60",
                          )}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={savingFollowUp}
                          onClick={() => {
                            setFollowUpDate("");
                            void saveFollowUp("");
                          }}
                          className={cn(
                            "rounded-xl border border-border bg-base/40 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/5",
                            savingFollowUp && "opacity-60",
                          )}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Type: {followUpLabel(lead.follow_up_type)}
                        {lead.follow_up_due && overdueDays !== null && overdueDays > 0 ? (
                          <span className="ml-2 text-rose-300">{`${overdueDays}d overdue`}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-border bg-panel px-3 py-2">
                      <span className="text-zinc-400">Stage</span>
                      <span className="font-semibold text-zinc-100">{formatStageLabel(lead.stage)}</span>
                    </div>
                    {languageEnabled ? (
                      <div className="grid gap-1 rounded-xl border border-border bg-panel px-3 py-2">
                        <div className="text-xs text-zinc-400">Language</div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setLanguageValue("english");
                              void saveLanguage("english");
                            }}
                            className={cn(
                              "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold",
                              languageValue === "english"
                                ? "border-purple/30 bg-purple/15 text-purple"
                                : "border-border bg-base/40 text-zinc-300 hover:bg-white/5",
                            )}
                          >
                            English
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLanguageValue("afrikaans");
                              void saveLanguage("afrikaans");
                            }}
                            className={cn(
                              "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold",
                              languageValue === "afrikaans"
                                ? "border-purple/30 bg-purple/15 text-purple"
                                : "border-border bg-base/40 text-zinc-300 hover:bg-white/5",
                            )}
                          >
                            Afrikaans
                          </button>
                        </div>
                        {savingLanguage ? <div className="text-xs text-zinc-400">Saving…</div> : null}
                      </div>
                    ) : null}
                    <div className="grid gap-1 rounded-xl border border-border bg-panel px-3 py-2">
                      <div className="text-xs text-zinc-400">Niche</div>
                      <div className="flex items-center gap-2">
                        <select
                          value={nicheValue}
                          onChange={(e) => {
                            const next = e.target.value as NicheOption;
                            setNicheValue(next);
                            void saveNiche(next);
                          }}
                          className="min-w-0 flex-1 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                        >
                          {NICHES.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                        {savingNiche ? <div className="text-xs text-zinc-400">Saving…</div> : null}
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border bg-panel px-3 py-2">
                      <span className="text-zinc-400">Last contacted</span>
                      <span className="font-semibold text-zinc-100">
                        {lead.last_contact_at ? getSaDateString(new Date(lead.last_contact_at)) : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-base/40 p-3">
                  <div className="text-xs text-zinc-400">Notes</div>
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    className="mt-2 min-h-[120px] w-full rounded-xl border border-border bg-base/40 p-3 text-sm text-zinc-100 outline-none focus:border-purple/40"
                    placeholder="Add notes like: wrong number, not owner, number doesn’t exist, etc."
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={savingNotes}
                      onClick={() => void saveNotes(notesValue)}
                      className={cn(
                        "rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-black hover:brightness-110",
                        savingNotes && "opacity-60",
                      )}
                    >
                      Save notes
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {tab === "messages" ? (
                  <div className="rounded-2xl border border-border bg-base/40 p-3">
                    <div className="text-xs text-zinc-400">Message history</div>
                    <div className="mt-2 grid gap-2 rounded-2xl border border-border bg-panel p-3">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select
                          value={newDirection}
                          onChange={(e) => setNewDirection(e.target.value as "sent" | "received")}
                          className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                        >
                          <option value="sent">Sent</option>
                          <option value="received">Received</option>
                        </select>
                        <button
                          type="button"
                          disabled={savingMessage}
                          onClick={() => void addMessage()}
                          className={cn(
                            "rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-black hover:brightness-110",
                            savingMessage && "opacity-60",
                          )}
                        >
                          Add
                        </button>
                      </div>
                      <textarea
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        className="min-h-[84px] w-full rounded-xl border border-border bg-base/40 p-3 text-sm text-zinc-100 outline-none focus:border-purple/40"
                        placeholder="Paste the real WhatsApp message here…"
                      />
                    </div>
                    {messages.length === 0 ? (
                      <div className="mt-2 text-sm text-zinc-500">No messages logged yet.</div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {messages.map((m) => (
                          <div
                            key={m.id}
                            className={cn(
                              "rounded-2xl border border-border p-3",
                              (m.direction ?? "sent") === "received" ? "bg-white/5" : "bg-panel",
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold text-zinc-300">{(m.direction ?? "sent") === "received" ? "Received" : "Sent"}</div>
                              <div className="text-xs text-zinc-500">{m.sent_at ? new Date(m.sent_at).toLocaleString() : ""}</div>
                            </div>
                            <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{m.message_text ?? ""}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-base/40 p-3">
                    <div className="text-xs text-zinc-400">Stage timeline</div>
                    {events.length === 0 ? (
                      <div className="mt-2 text-sm text-zinc-500">No stage events yet.</div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {events.map((e) => (
                          <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2">
                            <div className="min-w-0 text-sm text-zinc-200">
                              <span className="font-semibold">{formatStageLabel(e.to_stage)}</span>
                              {e.from_stage ? <span className="text-zinc-500">{` (from ${formatStageLabel(e.from_stage)})`}</span> : null}
                            </div>
                            <div className="text-xs text-zinc-500">{getSaDateString(new Date(e.changed_at))}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
