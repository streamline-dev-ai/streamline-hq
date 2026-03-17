import { useEffect, useMemo, useState } from "react";
import { Clipboard, ExternalLink, Mail, Phone, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast/ToastProvider";
import { useLeadContextStore, type LeadContext } from "@/stores/leadContext";
import { getSaDateString } from "@/utils/saDate";

type LeadRow = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  niche: string | null;
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

function normalizePhoneNumber(raw: string) {
  return raw.replace(/[^0-9]/g, "");
}

function formatStageLabel(stage: string | null) {
  const s = (stage ?? "new").toLowerCase();
  return s.replace(/_/g, " ");
}

export default function LeadDetailsDrawer({ lead, open, onClose }: { lead: LeadRow | null; open: boolean; onClose: () => void }) {
  const { pushToast } = useToast();
  const setActiveLead = useLeadContextStore((s) => s.setActiveLead);
  const [messages, setMessages] = useState<OutreachMessageRow[]>([]);
  const [events, setEvents] = useState<StageEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const leadContext: LeadContext | null = useMemo(() => {
    if (!lead) return null;
    return {
      id: lead.id,
      business_name: lead.business_name,
      owner_name: lead.owner_name,
      demo_url: lead.demo_url,
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
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load lead details";
        pushToast({ type: "error", title: "Lead details", message: msg });
      })
      .finally(() => setLoading(false));
  }, [lead, open, pushToast]);

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

  const phone = lead?.phone ? normalizePhoneNumber(lead.phone) : "";
  const wa = phone ? `https://wa.me/${phone}` : null;

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
          "absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[980px] rounded-t-3xl border border-border bg-panel p-4 transition-transform",
          "pb-[calc(env(safe-area-inset-bottom)+16px)]",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">{lead?.business_name ?? "Lead"}</div>
            <div className="mt-1 text-sm text-zinc-400">{lead?.owner_name ? lead.owner_name : "No owner name"}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-base/40 text-zinc-200 hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-border bg-base/40 p-4 text-sm text-zinc-400">Loading…</div>
        ) : lead ? (
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
                  <div className="flex items-center justify-between rounded-xl border border-border bg-panel px-3 py-2">
                    <span className="text-zinc-400">Stage</span>
                    <span className="font-semibold text-zinc-100">{formatStageLabel(lead.stage)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-panel px-3 py-2">
                    <span className="text-zinc-400">Niche</span>
                    <span className="font-semibold text-zinc-100">{lead.niche ?? "—"}</span>
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
                <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{lead.notes?.trim() ? lead.notes : "No notes"}</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-border bg-base/40 p-3">
                <div className="text-xs text-zinc-400">Message history</div>
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
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
