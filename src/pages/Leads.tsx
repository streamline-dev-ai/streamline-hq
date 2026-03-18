import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, ExternalLink, Phone, RefreshCcw, BarChart3, MessageSquareText, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { addDaysToSaYmd, daysBetweenSaYmd, daysSinceSaISOString, getSaDateString } from "@/utils/saDate";
import { useToast } from "@/components/toast/ToastProvider";
import LeadDetailsDrawer from "@/components/leads/LeadDetailsDrawer";
import LeadsAnalytics from "@/components/leads/LeadsAnalytics";
import { useSearchParams } from "react-router-dom";
import {
  getOutreachMessage,
  loadOutreachTemplates,
  OUTREACH_TEMPLATE_META,
  resetOutreachTemplates,
  saveOutreachTemplates,
  type OutreachTemplateKey,
} from "@/lib/outreach";

type LeadStage = "new" | "messaged" | "replied" | "demo_sent" | "proposal_sent" | "closed" | "lost";

type NicheOption = "electrical" | "plumbing" | "pest control" | "solar" | "aircon" | "handyman" | "other";

const NICHES: NicheOption[] = ["electrical", "plumbing", "pest control", "solar", "aircon", "handyman", "other"];

type LeadLanguage = "english" | "afrikaans";

type LeadRow = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  niche: string | null;
  language?: string | null;
  is_client: boolean | null;
  follow_up_due: string | null;
  follow_up_type: string | null;
  stage: LeadStage | string | null;
  last_contact_at: string | null;
  demo_url: string | null;
  notes: string | null;
  opener_used: string | null;
};

function nicheBadge(niche: string | null) {
  const n = (niche ?? "").trim().toLowerCase();
  if (!n) return null;
  return n;
}

function isFollowUpDue(lead: LeadRow, today: string) {
  if (!lead.follow_up_due) return false;
  const stage = (lead.stage ?? "new").toLowerCase();
  if (stage === "closed" || stage === "lost") return false;
  return daysBetweenSaYmd(today, lead.follow_up_due) >= 0;
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const start = header.includes("business_name") ? 1 : 0;
  const cols = header.includes("business_name") ? header : ["business_name", "owner_name", "phone", "niche", "notes"];

  const rows = [] as Array<Record<string, string>>;
  for (const line of lines.slice(start)) {
    const parts = parseLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < cols.length; i++) row[cols[i]] = parts[i] ?? "";
    rows.push(row);
  }
  return rows;
}

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

type LeadsFilterKey = (typeof FILTERS)[number]["key"] | "follow_up_due" | "not_contacted";

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
  language: LeadLanguage;
  niche: NicheOption;
  notes: string;
  demo_url: string;
};

const DEFAULT_FORM: AddLeadForm = {
  business_name: "",
  owner_name: "",
  phone: "",
  email: "",
  language: "english",
  niche: "electrical",
  notes: "",
  demo_url: "",
};

export default function Leads() {
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const saToday = useMemo(() => getSaDateString(), []);
  const saMonth = useMemo(() => saToday.slice(0, 7), [saToday]);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [tab, setTab] = useState<"pipeline" | "analytics">("pipeline");
  const [filter, setFilter] = useState<LeadsFilterKey>("all");
  const [nicheFilter, setNicheFilter] = useState<"all" | NicheOption>("all");
  const [query, setQuery] = useState("");
  const copyTimeoutRef = useRef<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<AddLeadForm>(DEFAULT_FORM);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [detailsLead, setDetailsLead] = useState<LeadRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"details" | "messages">("details");
  const [copiedOutreachLeadId, setCopiedOutreachLeadId] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatesDraft, setTemplatesDraft] = useState<Record<OutreachTemplateKey, string>>(() => loadOutreachTemplates());

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<
    Array<{
      id: string;
      selected: boolean;
      business_name: string;
      owner_name: string;
      phone: string;
      niche: string;
      notes: string;
      duplicate: boolean;
      duplicate_business_name: string | null;
      action: "insert" | "skip" | "update";
    }>
  >([]);
  const [importParsing, setImportParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const counts = useMemo(() => {
    const scoped = nicheFilter === "all" ? leads : leads.filter((l) => (l.niche ?? "").toLowerCase() === nicheFilter);
    const map = new Map<string, number>();
    for (const l of scoped) {
      const k = (l.stage ?? "new").toLowerCase();
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    const followUpDue = scoped.filter((l) => isFollowUpDue(l, saToday)).length;
    const notContacted = scoped.filter((l) => (l.stage ?? "new").toLowerCase() === "new" && !l.last_contact_at).length;
    return { map, followUpDue, notContacted, scopedCount: scoped.length };
  }, [leads, nicheFilter, saToday]);

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
        if (nicheFilter !== "all") {
          if ((l.niche ?? "").toLowerCase() !== nicheFilter) return false;
        }
        if (filter === "all") return true;
        if (filter === "follow_up_due") return isFollowUpDue(l, saToday);
        if (filter === "not_contacted") return (l.stage ?? "new").toLowerCase() === "new" && !l.last_contact_at;
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
  }, [filter, leads, nicheFilter, query, saToday]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supabase
        .from("leads")
        .select(
          "id, business_name, owner_name, phone, email, niche, language, is_client, follow_up_due, follow_up_type, stage, last_contact_at, demo_url, notes, opener_used",
        )
        .or("is_client.is.null,is_client.eq.false")
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
          if (next.is_client === true) {
            return prev.filter((l) => l.id !== next.id).slice().sort(sortLeads);
          }
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

  useEffect(() => {
    const id = searchParams.get("lead");
    if (!id) return;
    const openTab = searchParams.get("tab");
    const hit = leads.find((l) => l.id === id);
    if (!hit) return;
    setDetailsLead(hit);
    setDetailsTab(openTab === "messages" ? "messages" : "details");
    setDetailsOpen(true);
    setSearchParams((prev) => {
      prev.delete("lead");
      prev.delete("tab");
      return prev;
    });
  }, [leads, searchParams, setSearchParams]);

  async function handleStageChange(lead: LeadRow, nextStage: LeadStage) {
    const prevStage = lead.stage;
    const today = getSaDateString();
    const lower = nextStage.toLowerCase();
    let follow_up_due: string | null = lead.follow_up_due;
    let follow_up_type: string | null = lead.follow_up_type;

    if (lower === "messaged") {
      follow_up_due = addDaysToSaYmd(today, 3);
      follow_up_type = "no_reply_check";
    } else if (lower === "demo_sent") {
      follow_up_due = addDaysToSaYmd(today, 1);
      follow_up_type = "demo_check_in";
    } else if (lower === "proposal_sent") {
      follow_up_due = addDaysToSaYmd(today, 2);
      follow_up_type = "proposal_follow_up";
    } else if (lower === "closed" || lower === "lost") {
      follow_up_due = null;
      follow_up_type = null;
    }

    setSavingLeadId(lead.id);
    setLeads((prev) =>
      prev
        .map((l) => (l.id === lead.id ? { ...l, stage: nextStage, follow_up_due, follow_up_type } : l))
        .slice()
        .sort(sortLeads),
    );

    try {
      const res = await supabase.from("leads").update({ stage: nextStage, follow_up_due, follow_up_type }).eq("id", lead.id);
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

  function openDrawer(lead: LeadRow, openTab: "details" | "messages") {
    setDetailsLead(lead);
    setDetailsTab(openTab);
    setDetailsOpen(true);
  }

  async function markOutreachSent(lead: LeadRow) {
    const prevStage = (lead.stage ?? "new").toLowerCase();
    const nowIso = new Date().toISOString();
    const daysSince = lead.last_contact_at ? daysSinceSaISOString(lead.last_contact_at) : null;
    const isFollowUp = daysSince !== null && daysSince >= 3 && (prevStage === "messaged" || prevStage === "demo_sent");

    let nextStage = prevStage;
    let follow_up_due: string | null = lead.follow_up_due;
    let follow_up_type: string | null = lead.follow_up_type;

    if (!isFollowUp) {
      if (prevStage === "new") {
        nextStage = "messaged";
        follow_up_due = addDaysToSaYmd(saToday, 3);
        follow_up_type = "no_reply_check";
      } else if (prevStage === "messaged") {
        nextStage = "replied";
        follow_up_due = addDaysToSaYmd(saToday, 3);
        follow_up_type = "no_reply_check";
      } else if (prevStage === "replied") {
        nextStage = "demo_sent";
        follow_up_due = addDaysToSaYmd(saToday, 1);
        follow_up_type = "demo_check_in";
      } else if (prevStage === "demo_sent") {
        nextStage = "demo_sent";
        follow_up_due = addDaysToSaYmd(saToday, 3);
        follow_up_type = "demo_check_in";
      } else {
        follow_up_due = addDaysToSaYmd(saToday, 3);
      }
    } else {
      follow_up_due = addDaysToSaYmd(saToday, 3);
      follow_up_type = "no_reply_check";
    }

    setSavingLeadId(lead.id);
    setLeads((prev) =>
      prev
        .map((l) =>
          l.id === lead.id ? { ...l, stage: nextStage, last_contact_at: nowIso, follow_up_due, follow_up_type } : l,
        )
        .slice()
        .sort(sortLeads),
    );

    try {
      const res = await supabase
        .from("leads")
        .update({ stage: nextStage, last_contact_at: nowIso, follow_up_due, follow_up_type })
        .eq("id", lead.id);
      if (res.error) throw res.error;

      if (nextStage !== prevStage) {
        const ev = await supabase.from("lead_stage_events").insert({
          lead_id: lead.id,
          from_stage: prevStage ? String(prevStage) : null,
          to_stage: nextStage,
        });
        if (ev.error) pushToast({ type: "error", title: "Stage timeline", message: ev.error.message });
      }

      pushToast({ type: "success", title: "Sent", message: "Saved + follow-up scheduled" });
      setCopiedOutreachLeadId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to mark as sent";
      pushToast({ type: "error", title: "Outreach", message: msg });
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
    const language = form.language || "english";
    const email = form.email.trim() || null;
    const notes = form.notes.trim() || null;

    try {
      if (phone) {
        const dup = await supabase.from("leads").select("id, business_name").eq("phone", phone).limit(1);
        if (dup.error) throw dup.error;
        const hit = (dup.data ?? [])[0] as { id?: string; business_name?: string } | undefined;
        if (hit?.id) {
          pushToast({
            type: "error",
            title: "Duplicate",
            message: `This number already exists as ${hit.business_name ?? "an existing lead"}`,
          });
          return;
        }
      }

      const res = await supabase
        .from("leads")
        .insert({ business_name, owner_name, phone, email, niche, language, demo_url, notes, stage: "new", last_contact_at: null })
        .select("id, business_name, owner_name, phone, email, niche, language, is_client, stage, last_contact_at, demo_url, notes, opener_used")
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

  async function parseImport() {
    setImportParsing(true);
    try {
      const rows = parseCsv(importText);
      const base = rows
        .map((r, idx) => {
          const business_name = (r.business_name ?? "").trim();
          const owner_name = (r.owner_name ?? "").trim();
          const phone = normalizePhoneNumber((r.phone ?? "").trim());
          const nicheRaw = (r.niche ?? "").trim().toLowerCase();
          const niche = (NICHES as unknown as string[]).includes(nicheRaw) ? nicheRaw : nicheRaw ? "other" : "electrical";
          const notes = (r.notes ?? "").trim();
          return {
            id: `${idx}-${crypto.randomUUID()}`,
            selected: Boolean(business_name),
            business_name,
            owner_name,
            phone,
            niche,
            notes,
          };
        })
        .filter((r) => r.business_name);

      const phones = Array.from(new Set(base.map((r) => r.phone).filter(Boolean)));
      const existingByPhone = new Map<string, string>();
      if (phones.length) {
        const existingRes = await supabase.from("leads").select("phone, business_name").in("phone", phones);
        if (existingRes.error) throw existingRes.error;
        for (const row of existingRes.data ?? []) {
          const p = normalizePhoneNumber((row as any).phone ?? "");
          const b = String((row as any).business_name ?? "");
          if (p) existingByPhone.set(p, b);
        }
      }

      const seenInPaste = new Set<string>();
      const mapped = base.map((r) => {
        const p = r.phone;
        const duplicateExisting = p ? existingByPhone.has(p) : false;
        const duplicatePaste = p ? seenInPaste.has(p) : false;
        if (p) seenInPaste.add(p);

        const duplicate = duplicateExisting || duplicatePaste;
        const duplicate_business_name = duplicateExisting ? existingByPhone.get(p) ?? null : duplicatePaste ? "Duplicate in paste" : null;
        const action: "insert" | "skip" | "update" = duplicateExisting ? "skip" : duplicatePaste ? "skip" : "insert";
        return { ...r, duplicate, duplicate_business_name, action };
      });

      setImportPreview(mapped);
      if (mapped.length === 0) pushToast({ type: "error", title: "Import", message: "No valid rows found" });
    } finally {
      setImportParsing(false);
    }
  }

  async function importSelected() {
    const selected = importPreview.filter((r) => r.selected && r.action !== "skip");
    if (selected.length === 0) {
      pushToast({ type: "error", title: "Import", message: "No rows selected" });
      return;
    }

    setImporting(true);
    try {
      const phones = Array.from(new Set(selected.map((r) => r.phone).filter(Boolean)));
      const existingByPhone = new Map<string, { id: string; business_name: string }>();
      if (phones.length) {
        const existingRes = await supabase.from("leads").select("id, phone, business_name, owner_name, niche, notes").in("phone", phones);
        if (existingRes.error) throw existingRes.error;
        for (const row of existingRes.data ?? []) {
          const p = normalizePhoneNumber((row as any).phone ?? "");
          const id = String((row as any).id ?? "");
          const b = String((row as any).business_name ?? "");
          if (p && id) existingByPhone.set(p, { id, business_name: b });
        }
      }

      const rowsToInsert = [] as any[];
      const seenInPaste = new Set<string>();
      const updates: Array<{ id: string; payload: Record<string, any> }> = [];

      for (const r of selected) {
        const p = r.phone;
        if (p && seenInPaste.has(p)) continue;
        if (p) seenInPaste.add(p);

        if (r.action === "update" && p && existingByPhone.has(p)) {
          const existing = existingByPhone.get(p)!;
          const payload: Record<string, any> = {};
          if (r.business_name.trim()) payload.business_name = r.business_name.trim();
          if (r.owner_name.trim()) payload.owner_name = r.owner_name.trim();
          if (r.niche.trim()) payload.niche = r.niche.trim();
          if (r.notes.trim()) payload.notes = r.notes.trim();
          if (Object.keys(payload).length) updates.push({ id: existing.id, payload });
          continue;
        }

        if (p && existingByPhone.has(p)) continue;

        rowsToInsert.push({
          business_name: r.business_name,
          owner_name: r.owner_name || null,
          phone: r.phone || null,
          niche: r.niche || "electrical",
          notes: r.notes || null,
          stage: "new",
          last_contact_at: null,
          is_client: false,
          language: "english",
        });
      }

      if (rowsToInsert.length === 0 && updates.length === 0) {
        pushToast({ type: "info", title: "Import", message: "Nothing to import" });
        return;
      }

      if (rowsToInsert.length) {
        const insertRes = await supabase.from("leads").insert(rowsToInsert);
        if (insertRes.error) throw insertRes.error;
      }

      if (updates.length) {
        const results = await Promise.all(updates.map((u) => supabase.from("leads").update(u.payload).eq("id", u.id)));
        const err = results.find((r) => r.error)?.error;
        if (err) throw err;
      }

      pushToast({
        type: "success",
        title: "Imported",
        message: `${rowsToInsert.length} inserted, ${updates.length} updated`,
      });
      setImportOpen(false);
      setImportText("");
      setImportPreview([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to import";
      pushToast({ type: "error", title: "Import", message: msg });
    } finally {
      setImporting(false);
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
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            <Upload className="h-4 w-4" />
            Import leads
          </button>
          <button
            type="button"
            onClick={() => {
              setTemplatesDraft(loadOutreachTemplates());
              setTemplatesOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            Edit templates
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
              const count = t.key === "all" ? counts.scopedCount : counts.map.get(t.key) ?? 0;
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

            <button
              type="button"
              onClick={() => setFilter("follow_up_due")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                filter === "follow_up_due"
                  ? "border-orange/30 bg-orange/15 text-orange"
                  : "border-border bg-base/40 text-zinc-300 hover:bg-white/5",
              )}
            >
              <span>Follow up due</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  filter === "follow_up_due" ? "bg-orange/20 text-orange" : "bg-white/5 text-zinc-300",
                )}
              >
                {counts.followUpDue}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilter("not_contacted")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                filter === "not_contacted"
                  ? "border-rose-500/30 bg-rose-500/15 text-rose-300"
                  : "border-border bg-base/40 text-zinc-300 hover:bg-white/5",
              )}
            >
              <span>Not contacted</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  filter === "not_contacted" ? "bg-rose-500/20 text-rose-300" : "bg-white/5 text-zinc-300",
                )}
              >
                {counts.notContacted}
              </span>
            </button>
              </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={nicheFilter}
              onChange={(e) => setNicheFilter(e.target.value as any)}
              className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
            >
              <option value="all">All niches</option>
              {NICHES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
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
            const notContacted = !lead.last_contact_at;
                const saving = savingLeadId === lead.id;
                const due = isFollowUpDue(lead, saToday);
                const niche = nicheBadge(lead.niche);
                const days = lead.last_contact_at ? daysSinceSaISOString(lead.last_contact_at) : null;
                const badge: { kind: "due" | "not_contacted" | "days"; label: string } | null = due
                  ? { kind: "due", label: "Follow up due" }
                  : notContacted
                    ? { kind: "not_contacted", label: "Not contacted" }
                    : days === null
                      ? null
                      : { kind: "days", label: days === 0 ? "Today" : `${days}d ago` };

            return (
                  <div key={lead.id} className="rounded-2xl border border-border bg-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-zinc-100">{lead.business_name}</div>
                    {lead.owner_name ? <div className="mt-0.5 truncate text-sm text-zinc-400">{lead.owner_name}</div> : null}
                        {niche ? (
                          <div className="mt-1 inline-flex items-center rounded-full border border-border bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">
                            {niche}
                          </div>
                        ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className={cn("inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold", stageBadge(stage))}>
                      {formatStageLabel(stage)}
                    </div>
                        {badge ? (
                          <div
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold",
                              badge.kind === "due" && "border-orange/30 bg-orange/15 text-orange",
                              badge.kind === "not_contacted" && "border-rose-500/30 bg-rose-500/15 text-rose-300",
                              badge.kind === "days" && "border-border bg-white/5 text-zinc-300",
                            )}
                          >
                            {badge.label}
                          </div>
                        ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
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
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Demo
                    </a>
                  ) : null}
                </div>

                {lead.notes ? <div className="mt-3 text-sm text-zinc-300">{notesPreview(lead.notes)}</div> : <div className="mt-3 text-sm text-zinc-500">No notes</div>}

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const msg = getOutreachMessage({
                        stage: lead.stage,
                        language: lead.language ?? "english",
                        owner_name: lead.owner_name,
                        business_name: lead.business_name,
                        niche: lead.niche,
                        demo_url: lead.demo_url,
                        last_contact_at: lead.last_contact_at,
                      });
                      await navigator.clipboard.writeText(msg);
                      setCopiedOutreachLeadId(lead.id);
                      pushToast({ type: "success", title: "Copied", message: "Message copied" });
                    } catch {
                      pushToast({ type: "error", title: "Copy", message: "Clipboard access was blocked" });
                    }
                  }}
                  className="mt-3 w-full rounded-2xl border border-border bg-base/40 px-3 py-3 text-left text-sm text-zinc-100 hover:bg-white/5"
                >
                  <div className="text-xs text-zinc-400">Tap to copy message</div>
                  <div className="mt-1 whitespace-pre-wrap">
                    {getOutreachMessage({
                      stage: lead.stage,
                      language: lead.language ?? "english",
                      owner_name: lead.owner_name,
                      business_name: lead.business_name,
                      niche: lead.niche,
                      demo_url: lead.demo_url,
                      last_contact_at: lead.last_contact_at,
                    })}
                  </div>
                </button>

                {copiedOutreachLeadId === lead.id ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void markOutreachSent(lead)}
                    className={cn(
                      "mt-2 w-full rounded-xl bg-purple px-3 py-2 text-sm font-semibold text-black hover:brightness-110",
                      saving && "opacity-60",
                    )}
                  >
                    Mark as sent
                  </button>
                ) : null}

                <div className="mt-4 grid gap-2">
                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-xs text-zinc-400">Update Stage</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={(lead.stage ?? "new").toLowerCase()}
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

                      <button
                        type="button"
                        onClick={() => openDrawer(lead, "messages")}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5"
                      >
                        <MessageSquareText className="h-4 w-4" />
                        Message
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
              <label className="text-xs text-zinc-400">Language</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, language: "english" }))}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold",
                    form.language === "english"
                      ? "border-purple/30 bg-purple/15 text-purple"
                      : "border-border bg-base/40 text-zinc-300 hover:bg-white/5",
                  )}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, language: "afrikaans" }))}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold",
                    form.language === "afrikaans"
                      ? "border-purple/30 bg-purple/15 text-purple"
                      : "border-border bg-base/40 text-zinc-300 hover:bg-white/5",
                  )}
                >
                  Afrikaans
                </button>
              </div>
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Niche</label>
              <select
                value={form.niche}
                onChange={(e) => setForm((p) => ({ ...p, niche: e.target.value as NicheOption }))}
                className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
              >
                {NICHES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
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

      <div
        className={cn(
          "fixed inset-0 z-40 transition",
          importOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div
          onClick={() => setImportOpen(false)}
          className={cn("absolute inset-0 bg-black/60 transition-opacity", importOpen ? "opacity-100" : "opacity-0")}
        />
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[980px] rounded-t-3xl border border-border bg-panel p-4 transition-transform",
            "pb-[calc(env(safe-area-inset-bottom)+16px)]",
            importOpen ? "translate-y-0" : "translate-y-full"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Import leads</div>
              <div className="mt-1 text-sm text-zinc-400">Paste CSV: `business_name,owner_name,phone,niche,notes`</div>
            </div>
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="min-h-[160px] w-full rounded-2xl border border-border bg-base/40 p-3 text-sm text-zinc-100 outline-none focus:border-purple/40"
              placeholder="business_name,owner_name,phone,niche,notes\nEddie's Electrical,Eddie,27832350718,electrical,\n"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={importParsing}
                onClick={() => void parseImport()}
                className={cn(
                  "rounded-xl border border-border bg-base/40 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/5",
                  importParsing && "opacity-60"
                )}
              >
                Parse & Preview
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => void importSelected()}
                className={cn("rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-black hover:brightness-110", importing && "opacity-60")}
              >
                Import selected
              </button>
            </div>
          </div>

          {importPreview.length ? (
            <div className="mt-4 overflow-auto rounded-2xl border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-base/40 text-xs text-zinc-400">
                  <tr>
                    <th className="p-2">Use</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Action</th>
                    <th className="p-2">Business</th>
                    <th className="p-2">Owner</th>
                    <th className="p-2">Phone</th>
                    <th className="p-2">Niche</th>
                    <th className="p-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-t border-border bg-panel",
                        r.duplicate && "bg-rose-500/10",
                      )}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={r.selected}
                          onChange={(e) =>
                            setImportPreview((prev) => prev.map((x) => (x.id === r.id ? { ...x, selected: e.target.checked } : x)))
                          }
                        />
                      </td>
                      <td className="p-2 text-zinc-300">
                        {r.duplicate ? (
                          <span className="font-semibold text-rose-300">{`Duplicate${r.duplicate_business_name ? `: ${r.duplicate_business_name}` : ""}`}</span>
                        ) : (
                          <span className="text-emerald-300">New</span>
                        )}
                      </td>
                      <td className="p-2">
                        {r.duplicate ? (
                          <select
                            value={r.action}
                            onChange={(e) =>
                              setImportPreview((prev) =>
                                prev.map((x) =>
                                  x.id === r.id ? { ...x, action: e.target.value as any, selected: true } : x,
                                ),
                              )
                            }
                            className="rounded-xl border border-border bg-base/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple/40"
                          >
                            <option value="skip">Skip</option>
                            <option value="update">Update existing</option>
                          </select>
                        ) : (
                          <div className="text-xs font-semibold text-zinc-300">Insert</div>
                        )}
                      </td>
                      <td className="p-2 text-zinc-100">{r.business_name}</td>
                      <td className="p-2 text-zinc-300">{r.owner_name || "—"}</td>
                      <td className="p-2 text-zinc-300">{r.phone || "—"}</td>
                      <td className="p-2 text-zinc-300">{r.niche}</td>
                      <td className="p-2 text-zinc-400">{r.notes ? (r.notes.length > 60 ? `${r.notes.slice(0, 60)}…` : r.notes) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      <div className={cn("fixed inset-0 z-40 transition", templatesOpen ? "pointer-events-auto" : "pointer-events-none")}>
        <div
          onClick={() => setTemplatesOpen(false)}
          className={cn("absolute inset-0 bg-black/60 transition-opacity", templatesOpen ? "opacity-100" : "opacity-0")}
        />
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[980px] rounded-t-3xl border border-border bg-panel p-4 transition-transform",
            "pb-[calc(env(safe-area-inset-bottom)+16px)]",
            templatesOpen ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Outreach templates</div>
              <div className="mt-1 text-sm text-zinc-400">Variables: {"{owner_name}"} {"{business_name}"} {"{niche}"} {"{demo_url}"}</div>
            </div>
            <button
              type="button"
              onClick={() => setTemplatesOpen(false)}
              className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
            >
              Close
            </button>
          </div>

          <div className="mt-4 max-h-[60vh] overflow-auto rounded-2xl border border-border">
            <div className="grid gap-3 p-3">
              {OUTREACH_TEMPLATE_META.map((t) => (
                <div key={t.key} className="grid gap-1">
                  <div className="text-xs font-semibold text-zinc-300">{t.label}</div>
                  <textarea
                    value={templatesDraft[t.key]}
                    onChange={(e) => setTemplatesDraft((p) => ({ ...p, [t.key]: e.target.value }))}
                    className="min-h-[72px] w-full rounded-xl border border-border bg-base/40 p-3 text-sm text-zinc-100 outline-none focus:border-purple/40"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => {
                resetOutreachTemplates();
                setTemplatesDraft(loadOutreachTemplates());
                pushToast({ type: "info", title: "Templates", message: "Reset to defaults" });
              }}
              className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={() => {
                saveOutreachTemplates(templatesDraft);
                setTemplatesOpen(false);
                pushToast({ type: "success", title: "Templates", message: "Saved" });
              }}
              className="rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
            >
              Save templates
            </button>
          </div>
        </div>
      </div>

      <LeadDetailsDrawer
        lead={detailsLead}
        open={detailsOpen}
        initialTab={detailsTab}
        onClose={() => {
          setDetailsOpen(false);
        }}
      />
    </div>
  );
}

