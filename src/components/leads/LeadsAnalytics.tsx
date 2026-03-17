import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/lib/supabase";
import { getSaDateString } from "@/utils/saDate";
import { useToast } from "@/components/toast/ToastProvider";

type LeadRow = {
  id: string;
  stage: string | null;
  niche: string | null;
};

type OutreachMessageRow = {
  lead_id: string | null;
  direction: string | null;
  sent_at: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  send_count: number | null;
  reply_count: number | null;
};

function saYmd(d: Date) {
  return getSaDateString(d);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function safePct(reply: number, send: number) {
  if (send <= 0) return null;
  return Math.round((reply / send) * 100);
}

export default function LeadsAnalytics({ leads }: { leads: LeadRow[] }) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<OutreachMessageRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = daysAgo(13).toISOString();
      const [m, t] = await Promise.all([
        supabase.from("outreach_messages").select("lead_id, direction, sent_at").gte("sent_at", since),
        supabase.from("message_templates").select("id, name, send_count, reply_count").order("send_count", { ascending: false }),
      ]);
      if (m.error) throw m.error;
      if (t.error) throw t.error;
      setMessages((m.data ?? []) as OutreachMessageRow[]);
      setTemplates((t.data ?? []) as TemplateRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load analytics";
      pushToast({ type: "error", title: "Analytics", message: msg });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const stageFunnel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) {
      const k = (l.stage ?? "new").toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([stage, count]) => ({ stage: stage.replace(/_/g, " "), count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  const sentPerDay = useMemo(() => {
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) days.push(saYmd(daysAgo(i)));
    const map = new Map<string, number>();
    for (const d of days) map.set(d, 0);
    for (const m of messages) {
      if ((m.direction ?? "sent") !== "sent") continue;
      if (!m.sent_at) continue;
      const d = saYmd(new Date(m.sent_at));
      if (!map.has(d)) continue;
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return days.map((d) => ({ day: d.slice(5), sent: map.get(d) ?? 0 }));
  }, [messages]);

  const responseByTemplate = useMemo(() => {
    return templates
      .slice()
      .sort((a, b) => (b.send_count ?? 0) - (a.send_count ?? 0))
      .slice(0, 10)
      .map((t) => {
        const send = t.send_count ?? 0;
        const reply = t.reply_count ?? 0;
        const pct = safePct(reply, send);
        return { name: t.name, pct: pct ?? 0, hasData: send > 0 };
      });
  }, [templates]);

  const avgDaysToReply = useMemo(() => {
    const byLead = new Map<string, { firstSent?: number; firstReceivedAfter?: number }>();
    for (const m of messages) {
      if (!m.lead_id || !m.sent_at) continue;
      const ts = new Date(m.sent_at).getTime();
      const rec = byLead.get(m.lead_id) ?? {};
      if ((m.direction ?? "sent") === "sent") {
        if (!rec.firstSent || ts < rec.firstSent) rec.firstSent = ts;
      } else if ((m.direction ?? "sent") === "received") {
        if (rec.firstSent && ts >= rec.firstSent) {
          if (!rec.firstReceivedAfter || ts < rec.firstReceivedAfter) rec.firstReceivedAfter = ts;
        }
      }
      byLead.set(m.lead_id, rec);
    }

    const diffs: number[] = [];
    for (const v of byLead.values()) {
      if (!v.firstSent || !v.firstReceivedAfter) continue;
      diffs.push((v.firstReceivedAfter - v.firstSent) / 86400000);
    }
    if (diffs.length === 0) return null;
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    return Math.round(avg * 10) / 10;
  }, [messages]);

  const bestNiche = useMemo(() => {
    const leadNiche = new Map<string, string>();
    for (const l of leads) {
      if (!l.id) continue;
      leadNiche.set(l.id, (l.niche ?? "").trim().toLowerCase() || "unknown");
    }

    const repliedLead = new Set<string>();
    for (const m of messages) {
      if (!m.lead_id) continue;
      if ((m.direction ?? "sent") === "received") repliedLead.add(m.lead_id);
    }

    const counts = new Map<string, number>();
    for (const id of repliedLead) {
      const niche = leadNiche.get(id) ?? "unknown";
      counts.set(niche, (counts.get(niche) ?? 0) + 1);
    }

    let best: { niche: string; count: number } | null = null;
    for (const [niche, count] of counts.entries()) {
      if (!best || count > best.count) best = { niche, count };
    }
    return best;
  }, [leads, messages]);

  if (loading) {
    return <div className="rounded-2xl border border-border bg-panel p-4 text-sm text-zinc-400">Loading analytics…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="text-xs text-zinc-400">Avg days to reply</div>
          <div className="mt-1 text-2xl font-semibold">{avgDaysToReply === null ? "—" : `${avgDaysToReply}d`}</div>
          <div className="mt-1 text-sm text-zinc-500">From first sent to first received</div>
        </div>
        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="text-xs text-zinc-400">Best niche</div>
          <div className="mt-1 truncate text-2xl font-semibold">{bestNiche ? bestNiche.niche : "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">Replies in last 14 days</div>
        </div>
        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="text-xs text-zinc-400">Messages sent</div>
          <div className="mt-1 text-2xl font-semibold">{sentPerDay.reduce((a, b) => a + b.sent, 0)}</div>
          <div className="mt-1 text-sm text-zinc-500">Last 14 days</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="text-sm font-semibold">Messages sent per day</div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sentPerDay} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0f0f14", border: "1px solid #23232b" }} cursor={{ fill: "rgba(139,92,246,0.08)" }} />
                <Bar dataKey="sent" fill="#8b5cf6" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="text-sm font-semibold">Response rate by template</div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={responseByTemplate} layout="vertical" margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} domain={[0, 100]} />
                <YAxis type="category" dataKey="name" width={140} stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#0f0f14", border: "1px solid #23232b" }} cursor={{ fill: "rgba(249,115,22,0.08)" }} />
                <Bar dataKey="pct" fill="#f97316" radius={[0, 10, 10, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="text-sm font-semibold">Stage funnel</div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageFunnel} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="stage" stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0f0f14", border: "1px solid #23232b" }} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="text-sm font-semibold">Notes</div>
          <div className="mt-2 text-sm text-zinc-400">
            Tracking relies on `outreach_messages` rows. Use “Copy & Track” on /messages and “Copy & Use” on AI suggestions.
          </div>
        </div>
      </div>
    </div>
  );
}

