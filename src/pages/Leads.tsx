import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, ExternalLink, Clipboard, Check, Phone, RefreshCcw, Sparkles, BarChart3 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { daysSinceSaISOString, getSaDateString } from "@/utils/saDate";
import { useToast } from "@/components/toast/ToastProvider";
import LeadDetailsDrawer from "@/components/leads/LeadDetailsDrawer";
import SuggestReplyModal from "@/components/leads/SuggestReplyModal";
import LeadsAnalytics from "@/components/leads/LeadsAnalytics";

type LeadStage = "new" | "messaged" | "replied" | "demo_sent" | "proposal_sent" | "closed" | "lost";

type LeadRow = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  niche: string | null;
  stage: LeadStage | string | null;
  last_contact_at: string | null;
  demo_url: string | null;
  notes: string | null;
  opener_used: string | null;
};

const STAGES: { key: LeadStage; label: string }[] = [
  { key: "new", label: "New" },
  { key: "messaged", label: "Messaged" },
  { key: "replied", label: "Replied" },
  { key: "demo_sent", label: "Demo Sent" },
  { key: "proposal_sent", label: "Proposal" },
  { key: "closed", label: "Closed" },
  { key: "lost", label: "Lost" },
];

const FILTERS: { key: "all" | LeadStage; label: string; stage?: LeadStage }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New", stage: "new" },
  { key: "messaged", label: "Messaged", stage: "messaged" },
  { key: "replied", label: "Replied", stage: "replied" },
  { key: "demo_sent", label: "Demo Sent", stage: "demo_sent" },
  { key: "proposal_sent", label: "Proposal", stage: "proposal_sent" },
  { key: "closed", label: "Closed", stage: "closed" },
];

function normalizePhoneNumber(raw: string) {
  return raw.replace(/[^0-9]/g, "");
}

function stageBadge(stage: string | null) {
  const s = (stage ?? "new").toLowerCase();
  if (s === "new") return "bg-zinc-500/15 text-zinc-300 border-zinc-500/25";
  if (s === "messaged") return "bg-sky-500/15 text-sky-300 border-sky-500/25";
  if (s === "replied") return "bg-purple/15 text-purple border-purple/25";
  if (s === "demo_sent") return "bg-amber-500/15 text-amber-300 border-amber-500/25";
  if (s === "proposal_sent") return "bg-orange/15 text-orange border-orange/25";
  if (s === "closed") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  if (s === "lost") return "bg-rose-500/15 text-rose-300 border-rose-500/25";
  return "bg-zinc-500/15 text-zinc-300 border-zinc-500/25";
}

function formatStageLabel(stage: string | null) {
  const s = (stage ?? "new").toLowerCase();
  const hit = STAGES.find((x) => x.key === s);
  return hit?.label ?? s.replace(/_/g, " ");
}

function sortLeads(a: LeadRow, b: LeadRow) {
  if (!a.last_contact_at && !b.last_contact_at) return a.business_name.localeCompare(b.business_name);
  if (!a.last_contact_at) return -1;
  if (!b.last_contact_at) return 1;
  return new Date(a.last_contact_at).getTime() - new Date(b.last_contact_at).getTime();
}

function notesPreview(notes: string | null) {
  const t = (notes ?? "").trim();
  if (!t) return "";
  return t.length <= 60 ? t : `${t.slice(0, 60)}…`;
}

function statCard(label: string, value: number | string) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-3">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold leading-none">{value}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="animate-pulse">
        <div className="h-4 w-2/3 rounded bg-white/10" />
        <div className="mt-2 h-3 w-1/2 rounded bg-white/5" />
        <div className="mt-4 flex gap-2">
          <div className="h-6 w-20 rounded-full bg-white/10" />
          <div className="h-6 w-24 rounded-full bg-white/10" />
        </div>
        <div className="mt-4 h-3 w-full rounded bg-white/5" />
        <div className="mt-2 h-3 w-4/5 rounded bg-white/5" />
        <div className="mt-4 h-10 w-full rounded-xl bg-white/10" />
      </div>
    </div>
  );
}

type AddLeadForm = {
  business_name: string;
  owner_name: string;
  phone: string;
  email: string;
  niche: string;
  notes: string;
  demo_url: string;
};

const DEFAULT_FORM: AddLeadForm = {
  business_name: "",
  owner_name: "",
  phone: "",
  email: "",
  niche: "electrical",
  notes: "",
  demo_url: "",
};

export default function Leads() {
  const { pushToast } = useToast();
  const saToday = useMemo(() => getSaDateString(), []);
  const saMonth = useMemo(() => saToday.slice(0, 7), [saToday]);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [tab, setTab] = useState<"pipeline" | "analytics">("pipeline");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = useState("");
  const [copiedLeadId, setCopiedLeadId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<AddLeadForm>(DEFAULT_FORM);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [detailsLead, setDetailsLead] = useState<LeadRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [suggestLead, setSuggestLead] = useState<Pick<LeadRow, "id" | "business_name" | "owner_name" | "stage" | "notes"> | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const k = (l.stage ?? "new").toLowerCase();
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [leads]);

  const stats = useMemo(() => {
    let contactedToday = 0;
    let awaitingReply = 0;
    let closedThisMonth = 0;

    for (const l of leads) {
      const stage = (l.stage ?? "new").toLowerCase();
      if (l.last_contact_at) {
        const ymd = getSaDateString(new Date(l.last_contact_at));
        if (ymd === saToday) contactedToday += 1;
        if (stage === "messaged" && daysSinceSaISOString(l.last_contact_at) >= 3) awaitingReply += 1;
        if (stage === "closed" && ymd.slice(0, 7) === saMonth) closedThisMonth += 1;
      }
    }

    return {
      total: leads.length,
      contactedToday,
      awaitingReply,
      closedThisMonth,
    };
  }, [leads, saMonth, saToday]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter((l) => {
        if (filter === "all") return true;
        return (l.stage ?? "new").toLowerCase() === filter;
      })
      .filter((l) => {
        if (!q) return true;
        const a = (l.business_name ?? "").toLowerCase();
        const b = (l.owner_name ?? "").toLowerCase();
        return a.includes(q) || b.includes(q);
      })
      .slice()
      .sort(sortLeads);
  }, [filter, leads, query]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supabase
        .from("leads")
        .select("id, business_name, owner_name, phone, email, niche, stage, last_contact_at, demo_url, notes, opener_used")
        .order("last_contact_at", { ascending: true, nullsFirst: true });

      if (res.error) throw res.error;
      setLeads(((res.data ?? []) as LeadRow[]).slice().sort(sortLeads));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load leads";
      pushToast({ type: "error", title: "Leads", message: msg });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    const channel = supabase
      .channel("leads-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        setLeads((prev) => {
          const event = payload.eventType;
          if (event === "DELETE") {
            const id = (payload.old as { id?: string } | null)?.id;
            if (!id) return prev;
            return prev.filter((l) => l.id !== id).slice().sort(sortLeads);
          }

          const next = payload.new as Partial<LeadRow> | null;
          if (!next?.id) return prev;
          const idx = prev.findIndex((l) => l.id === next.id);
          if (idx === -1) return [...prev, next as LeadRow].slice().sort(sortLeads);
          const updated = prev.slice();
          updated[idx] = { ...updated[idx], ...(next as LeadRow) };
          return updated.slice().sort(sortLeads);
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  async function handleStageChange(lead: LeadRow, nextStage: LeadStage) {
    const prevStage = lead.stage;
    setSavingLeadId(lead.id);
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage: nextStage } : l)).slice().sort(sortLeads));

    try {
      const res = await supabase.from("leads").update({ stage: nextStage }).eq("id", lead.id);
      if (res.error) throw res.error;
      const ev = await supabase.from("lead_stage_events").insert({
        lead_id: lead.id,
        from_stage: prevStage ? String(prevStage) : null,
        to_stage: nextStage,
      });
      if (ev.error) pushToast({ type: "error", title: "Stage timeline", message: ev.error.message });
    } catch (e) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage: prevStage } : l)).slice().sort(sortLeads));
      const msg = e instanceof Error ? e.message : "Failed to update stage";
      pushToast({ type: "error", title: "Update stage", message: msg });
    } finally {
      setSavingLeadId((x) => (x === lead.id ? null : x));
    }
  }

  async function copyOpener(lead: LeadRow) {
    const owner = (lead.owner_name ?? "").trim();
    const msg = owner
      ? `Hi, is this ${owner} from ${lead.business_name}? 👋`
      : `Hi, is this the owner of ${lead.business_name}? 👋`;

    try {
      await navigator.clipboard.writeText(msg);
      setCopiedLeadId(lead.id);
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopiedLeadId(null), 2000);
    } catch {
      pushToast({ type: "error", title: "Copy opener", message: "Clipboard access was blocked" });
      return;
    }

    const nowIso = new Date().toISOString();
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, last_contact_at: nowIso, opener_used: "opener" } : l)).slice().sort(sortLeads));
    try {
      await supabase.from("outreach_messages").insert({
        lead_id: lead.id,
        direction: "sent",
        message_text: msg,
        template_id: "opener",
        sent_at: nowIso,
        replied: false,
      });
      const upd = await supabase.from("leads").update({ last_contact_at: nowIso, opener_used: "opener" }).eq("id", lead.id);
      if (upd.error) throw upd.error;
    } catch (e) {
      const m = e instanceof Error ? e.message : "Failed to log opener";
      pushToast({ type: "error", title: "Copy opener", message: m });
    }
  }

  async function logContact(lead: LeadRow) {
    const prev = lead.last_contact_at;
    const next = new Date().toISOString();
    setSavingLeadId(lead.id);
    setLeads((p) => p.map((l) => (l.id === lead.id ? { ...l, last_contact_at: next } : l)).slice().sort(sortLeads));
    try {
      const res = await supabase.from("leads").update({ last_contact_at: next }).eq("id", lead.id);
      if (res.error) throw res.error;
      pushToast({ type: "success", title: "Logged", message: "Contact time updated" });
    } catch (e) {
      setLeads((p) => p.map((l) => (l.id === lead.id ? { ...l, last_contact_at: prev } : l)).slice().sort(sortLeads));
      const msg = e instanceof Error ? e.message : "Failed to log contact";
      pushToast({ type: "error", title: "Log contact", message: msg });
    } finally {
      setSavingLeadId((x) => (x === lead.id ? null : x));
    }
  }

  async function submitLead() {
    const business_name = form.business_name.trim();
    if (!business_name) {
      pushToast({ type: "error", title: "Add lead", message: "Business name is required" });
      return;
    }

    const owner_name = form.owner_name.trim() || null;
    const phone = normalizePhoneNumber(form.phone.trim()) || null;
    const demo_url = form.demo_url.trim() || null;

    const niche = form.niche.trim() || null;
    const email = form.email.trim() || null;
    const notes = form.notes.trim() || null;

    try {
      const res = await supabase
        .from("leads")
        .insert({ business_name, owner_name, phone, email, niche, demo_url, notes, stage: "new", last_contact_at: null })
        .select("id, business_name, owner_name, phone, email, niche, stage, last_contact_at, demo_url, notes, opener_used")
        .single();
      if (res.error) throw res.error;
      if (res.data) {
        setLeads((prev) => [res.data as LeadRow, ...prev].slice().sort(sortLeads));
        await supabase.from("lead_stage_events").insert({ lead_id: (res.data as LeadRow).id, from_stage: null, to_stage: "new" });
        pushToast({ type: "success", title: "Added", message: business_name });
      }
      setDrawerOpen(false);
      setForm(DEFAULT_FORM);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add lead";
      pushToast({ type: "error", title: "Add lead", message: msg });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold leading-none">Lead pipeline</div>
          <div className="mt-1 text-sm text-zinc-400">Oldest contact first (SAST)</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadLeads()}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-purple px-3 py-2 text-sm font-semibold text-black hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("pipeline")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
            tab === "pipeline" ? "border-purple/30 bg-purple/15 text-purple" : "border-border bg-panel text-zinc-200 hover:bg-white/5",
          )}
        >
          <span>Pipeline</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("analytics")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
            tab === "analytics" ? "border-orange/30 bg-orange/15 text-orange" : "border-border bg-panel text-zinc-200 hover:bg-white/5",
          )}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Analytics</span>
        </button>
      </div>

      {tab === "pipeline" ? (
        <>
          <div className="rounded-2xl border border-border bg-panel p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((t) => {
                  const count = t.key === "all" ? leads.length : counts.get(t.key) ?? 0;
                  const active = filter === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setFilter(t.key)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                        active ? "border-purple/30 bg-purple/15 text-purple" : "border-border bg-base/40 text-zinc-300 hover:bg-white/5",
                      )}
                    >
                      <span>{t.label}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", active ? "bg-purple/20 text-purple" : "bg-white/5 text-zinc-300")}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search business or owner…"
                  className="w-full rounded-xl border border-border bg-base/40 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-purple/40"
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {statCard("Total leads", stats.total)}
              {statCard("Contacted today", stats.contactedToday)}
              {statCard("Awaiting reply", stats.awaitingReply)}
              {statCard("Closed this month", stats.closedThisMonth)}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-border bg-panel p-6 text-center">
              <div className="text-sm font-semibold">No leads</div>
              <div className="mt-1 text-sm text-zinc-400">No leads match your current filter/search.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((lead) => {
            const stage = (lead.stage ?? "new").toLowerCase();
            const phone = lead.phone ? normalizePhoneNumber(lead.phone) : "";
            const wa = phone ? `https://wa.me/${phone}` : null;
            const days = lead.last_contact_at ? daysSinceSaISOString(lead.last_contact_at) : null;
            const followUp = days !== null && days >= 3;
            const notContacted = !lead.last_contact_at;
            const saving = savingLeadId === lead.id;

            return (
              <div
                key={lead.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setDetailsLead(lead);
                  setDetailsOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setDetailsLead(lead);
                    setDetailsOpen(true);
                  }
                }}
                className="cursor-pointer rounded-2xl border border-border bg-panel p-4 outline-none hover:bg-white/5 focus:ring-2 focus:ring-purple/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{lead.business_name}</div>
                    {lead.owner_name ? <div className="mt-0.5 truncate text-sm text-zinc-400">{lead.owner_name}</div> : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className={cn("inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold", stageBadge(stage))}>
                      {formatStageLabel(stage)}
                    </div>
                    {notContacted ? (
                      <div className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-300">
                        Not contacted
                      </div>
                    ) : followUp && stage !== "closed" && stage !== "lost" ? (
                      <div className="inline-flex items-center rounded-full border border-orange/30 bg-orange/15 px-2 py-1 text-xs font-semibold text-orange">
                        Follow up
                      </div>
                    ) : (
                      <div className="inline-flex items-center rounded-full border border-border bg-white/5 px-2 py-1 text-xs text-zinc-300">
                        {days === 0 ? "Today" : `${days}d ago`}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
                    >
                      <Phone className="h-4 w-4" />
                      <span className="truncate">{phone}</span>
                    </a>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-500">
                      <Phone className="h-4 w-4" />
                      No phone
                    </div>
                  )}
                  {lead.demo_url ? (
                    <a
                      href={lead.demo_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Demo
                    </a>
                  ) : null}
                </div>

                {lead.notes ? <div className="mt-3 text-sm text-zinc-300">{notesPreview(lead.notes)}</div> : <div className="mt-3 text-sm text-zinc-500">No notes</div>}

                <div className="mt-4 grid gap-2">
                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-xs text-zinc-400">Update Stage</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={(lead.stage ?? "new").toLowerCase()}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => void handleStageChange(lead, e.target.value as LeadStage)}
                        className="min-w-0 flex-1 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {saving ? <div className="text-xs text-zinc-400">Saving…</div> : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyOpener(lead);
                      }}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                        copiedLeadId === lead.id
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                          : "border-border bg-base/40 text-zinc-200 hover:bg-white/5",
                      )}
                    >
                      {copiedLeadId === lead.id ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                      {copiedLeadId === lead.id ? "Copied!" : "Copy Opener"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void logContact(lead);
                      }}
                      className="inline-flex items-center justify-center rounded-xl border border-border bg-base/40 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5"
                    >
                      Log Contact
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSuggestLead({ id: lead.id, business_name: lead.business_name, owner_name: lead.owner_name, stage: lead.stage, notes: lead.notes });
                      setSuggestOpen(true);
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange/30 bg-orange/15 px-3 py-2 text-sm font-semibold text-orange hover:brightness-110"
                  >
                    <Sparkles className="h-4 w-4" />
                    Suggest Reply
                  </button>
                </div>
              </div>
            );
              })}
            </div>
          )}
        </>
      ) : null}

      {tab === "analytics" ? <LeadsAnalytics leads={leads.map((l) => ({ id: l.id, stage: l.stage, niche: l.niche }))} /> : null}

      <div
        className={cn(
          "fixed inset-0 z-40 transition",
          drawerOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/60 transition-opacity",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[800px] rounded-t-3xl border border-border bg-panel p-4 transition-transform",
            "pb-[calc(env(safe-area-inset-bottom)+16px)]",
            drawerOpen ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Add lead</div>
              <div className="mt-1 text-sm text-zinc-400">Saved instantly to Supabase</div>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Business name *</label>
              <input
                value={form.business_name}
                onChange={(e) => setForm((p) => ({ ...p, business_name: e.target.value }))}
                className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                placeholder="Eddie's Electrical"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Owner name</label>
              <input
                value={form.owner_name}
                onChange={(e) => setForm((p) => ({ ...p, owner_name: e.target.value }))}
                className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                placeholder="Eddie"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                placeholder="27832350718"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                placeholder="name@example.com"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Niche</label>
              <input
                value={form.niche}
                onChange={(e) => setForm((p) => ({ ...p, niche: e.target.value }))}
                className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                placeholder="electrical"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Demo URL</label>
              <input
                value={form.demo_url}
                onChange={(e) => setForm((p) => ({ ...p, demo_url: e.target.value }))}
                className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="mt-3 grid gap-1">
            <label className="text-xs text-zinc-400">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="min-h-[96px] rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
              placeholder="Any context you want to remember…"
            />
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setForm(DEFAULT_FORM);
                setDrawerOpen(false);
              }}
              className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitLead()}
              className="rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
            >
              Save Lead
            </button>
          </div>
        </div>
      </div>

      <LeadDetailsDrawer
        lead={detailsLead}
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
        }}
      />

      <SuggestReplyModal
        lead={suggestLead}
        open={suggestOpen}
        onClose={() => {
          setSuggestOpen(false);
        }}
      />
    </div>
  );
}

