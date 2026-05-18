import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCcw,
  Check,
  Clipboard,
  Minus,
  Plus,
  Sun,
  Ban,
  Cigarette,
  Dumbbell,
  ListChecks,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatZAPhone } from "@/lib/phone";
import { getSaDateString, addDaysToSaYmd, daysSinceSaISOString } from "@/utils/saDate";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useToast } from "@/components/toast/ToastProvider";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Badge,
  StageBadge,
  Stat,
  Skeleton,
  PageHeader,
  PageTransition,
} from "@/ui";

type DailyCheckinRow = {
  id: string;
  date: string;
  outreach_count: number;
  no_scroll: boolean;
  no_smoking: boolean;
  morning_routine: boolean;
  workout: boolean;
  tasks_written: boolean;
};
type TaskRow = { id: string; date: string; text: string; done: boolean };
type LeadRow = { id: string; stage: string | null };
type FollowUpLeadRow = {
  id: string;
  business_name: string;
  owner_name: string | null;
  stage: string | null;
  last_contact_at?: string | null;
  phone?: string | null;
  follow_up_due: string | null;
  follow_up_type: string | null;
};

function followUpLabel(t: string | null) {
  const k = (t ?? "").toLowerCase();
  if (k === "demo_check_in") return "Demo check-in";
  if (k === "no_reply_check") return "No reply check";
  if (k === "proposal_follow_up") return "Proposal follow-up";
  return t ? t.replace(/_/g, " ") : "Follow-up";
}
function followUpText(stage: string | null, business: string, owner: string | null) {
  const who = (owner ?? "").trim() ? owner!.trim() : "there";
  const s = (stage ?? "new").toLowerCase();
  if (s === "messaged")
    return `Hi ${who}, just checking if you got my message — I built a demo website for ${business}. Want me to send it through?`;
  if (s === "demo_sent")
    return `Hi ${who}, just checking if you had a chance to look at the demo I sent? Happy to walk you through it on a quick call if easier`;
  if (s === "replied")
    return `Hi ${who}, following up on our chat — still happy to get ${business} online. Want to take a look?`;
  return `Hi ${who}, just checking in — do you want me to send you a quick demo for ${business}?`;
}
function openerText(business: string, owner: string | null) {
  const who = (owner ?? "").trim();
  return who ? `Hi, is this ${who} from ${business}?` : `Hi, is this the owner of ${business}?`;
}
function snapshotCheckin(c: DailyCheckinRow) {
  return JSON.stringify({
    outreach_count: c.outreach_count,
    no_scroll: c.no_scroll,
    no_smoking: c.no_smoking,
    morning_routine: c.morning_routine,
    workout: c.workout,
    tasks_written: c.tasks_written,
  });
}

const HABITS: { key: keyof DailyCheckinRow; label: string; Icon: typeof Sun }[] = [
  { key: "morning_routine", label: "Morning routine", Icon: Sun },
  { key: "workout", label: "Workout", Icon: Dumbbell },
  { key: "no_scroll", label: "No scrolling", Icon: Ban },
  { key: "no_smoking", label: "No smoking", Icon: Cigarette },
  { key: "tasks_written", label: "Tasks written", Icon: ListChecks },
];

export default function Today() {
  const saDate = useMemo(() => getSaDateString(), []);
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkin, setCheckin] = useState<DailyCheckinRow | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpLeadRow[]>([]);
  const [newLeads, setNewLeads] = useState<FollowUpLeadRow[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef<string | null>(null);
  const debouncedCheckin = useDebouncedValue(checkin, 350);

  const pipelineData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const stage = (lead.stage ?? "new").trim() || "new";
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const checkinPromise = (async () => {
      const res = await supabase.from("daily_checkins").select("*").eq("date", saDate).maybeSingle();
      if (res.error) throw res.error;
      if (res.data) return res.data as DailyCheckinRow;
      const insertRes = await supabase
        .from("daily_checkins")
        .insert({ date: saDate, outreach_count: 0, no_scroll: false, no_smoking: false, morning_routine: false, workout: false, tasks_written: false })
        .select("*")
        .single();
      if (!insertRes.error) return insertRes.data as DailyCheckinRow;
      const retry = await supabase.from("daily_checkins").select("*").eq("date", saDate).maybeSingle();
      if (retry.error) throw retry.error;
      if (!retry.data) throw insertRes.error;
      return retry.data as DailyCheckinRow;
    })();

    try {
      const [checkinRow, tasksRes, leadsRes, followUpsRes, newLeadsRes] = await Promise.all([
        checkinPromise,
        supabase.from("tasks").select("*").eq("date", saDate).order("done", { ascending: true }).limit(3),
        supabase.from("leads").select("id, stage"),
        supabase
          .from("leads")
          .select("id, business_name, owner_name, stage, last_contact_at, follow_up_due, follow_up_type, is_client")
          .lte("follow_up_due", saDate)
          .not("stage", "in", "(closed,lost)")
          .or("is_client.is.null,is_client.eq.false")
          .order("follow_up_due", { ascending: true }),
        supabase
          .from("leads")
          .select("id, business_name, owner_name, phone, stage, last_contact_at, is_client")
          .eq("stage", "new")
          .is("last_contact_at", null)
          .or("is_client.is.null,is_client.eq.false")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (tasksRes.error) throw tasksRes.error;
      if (leadsRes.error) throw leadsRes.error;
      if (followUpsRes.error) throw followUpsRes.error;
      if (newLeadsRes.error) throw newLeadsRes.error;
      lastSavedRef.current = snapshotCheckin(checkinRow);
      setCheckin(checkinRow);
      setTasks((tasksRes.data ?? []) as TaskRow[]);
      setLeads((leadsRes.data ?? []) as LeadRow[]);
      setFollowUps((followUpsRes.data ?? []) as unknown as FollowUpLeadRow[]);
      setNewLeads((newLeadsRes.data ?? []) as unknown as FollowUpLeadRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [saDate]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const channel = supabase
      .channel(`today-${saDate}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_checkins", filter: `date=eq.${saDate}` }, () => {
        supabase.from("daily_checkins").select("*").eq("date", saDate).maybeSingle().then((r) => {
          if (!r.data) return;
          lastSavedRef.current = snapshotCheckin(r.data as DailyCheckinRow);
          setCheckin(r.data as DailyCheckinRow);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `date=eq.${saDate}` }, () => {
        supabase.from("tasks").select("*").eq("date", saDate).order("done", { ascending: true }).limit(3).then((r) => {
          if (r.data) setTasks(r.data as TaskRow[]);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => void loadAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [saDate, loadAll]);

  useEffect(() => {
    if (!debouncedCheckin) return;
    const snap = snapshotCheckin(debouncedCheckin);
    if (lastSavedRef.current === snap) return;
    lastSavedRef.current = snap;
    setSaving(true);
    (async () => {
      try {
        const r = await supabase
          .from("daily_checkins")
          .update({
            outreach_count: debouncedCheckin.outreach_count,
            no_scroll: debouncedCheckin.no_scroll,
            no_smoking: debouncedCheckin.no_smoking,
            morning_routine: debouncedCheckin.morning_routine,
            workout: debouncedCheckin.workout,
            tasks_written: debouncedCheckin.tasks_written,
          })
          .eq("id", debouncedCheckin.id);
        if (r.error) setError(r.error.message);
      } finally {
        setSaving(false);
      }
    })();
  }, [debouncedCheckin]);

  function setField<K extends keyof DailyCheckinRow>(key: K, value: DailyCheckinRow[K]) {
    setCheckin((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function addTask() {
    const text = newTaskText.trim();
    if (!text || tasks.length >= 3) return;
    setNewTaskText("");
    const res = await supabase.from("tasks").insert({ date: saDate, text, done: false }).select("*").single();
    if (!res.error && res.data) setTasks((p) => [...p, res.data as TaskRow].slice(0, 3));
    else await loadAll();
  }
  async function toggleTask(id: string, done: boolean) {
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, done } : t)));
    const res = await supabase.from("tasks").update({ done }).eq("id", id);
    if (res.error) await loadAll();
  }
  async function copySummary() {
    const outreach = checkin?.outreach_count ?? 0;
    const doneTasks = tasks.filter((t) => t.done).length;
    const habitsDone = HABITS.filter((h) => checkin?.[h.key]).length;
    const msg = `Streamline HQ (${saDate})\nOutreach: ${outreach}\nTasks: ${doneTasks}/${tasks.length}\nHabits: ${habitsDone}/5`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      pushToast({ type: "error", title: "Copy", message: "Clipboard blocked" });
    }
  }
  async function copyMsg(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
    } catch {
      pushToast({ type: "error", title: "Copy", message: "Clipboard blocked" });
    }
  }
  async function markFollowUpSent(id: string) {
    const nextDue = addDaysToSaYmd(saDate, 3);
    const r = await supabase
      .from("leads")
      .update({ last_contact_at: new Date().toISOString(), follow_up_due: nextDue })
      .eq("id", id);
    if (r.error) return pushToast({ type: "error", title: "Follow-up", message: r.error.message });
    pushToast({ type: "success", title: "Sent", message: "Follow-up scheduled" });
    setCopiedId(null);
    setFollowUps((p) => p.filter((l) => l.id !== id));
  }
  async function markNewLeadMessaged(id: string) {
    const nextDue = addDaysToSaYmd(saDate, 3);
    const r = await supabase
      .from("leads")
      .update({ stage: "messaged", last_contact_at: new Date().toISOString(), follow_up_due: nextDue, follow_up_type: "no_reply_check" })
      .eq("id", id);
    if (r.error) return pushToast({ type: "error", title: "New leads", message: r.error.message });
    pushToast({ type: "success", title: "Messaged", message: "Follow-up scheduled" });
    setCopiedId(null);
    setNewLeads((p) => p.filter((l) => l.id !== id));
  }

  const doneTasks = tasks.filter((t) => t.done).length;
  const habitsDone = HABITS.filter((h) => checkin?.[h.key]).length;

  return (
    <PageTransition>
      <PageHeader
        title="Today"
        subtitle={saDate}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void loadAll()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button variant={copied ? "subtle" : "secondary"} size="sm" onClick={() => void copySummary()}>
              {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              {copied ? "Copied" : "Summary"}
            </Button>
          </div>
        }
      />

      {error && (
        <Card className="mb-4 border-danger/30">
          <CardBody className="text-sm text-danger">{error}</CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Stat
          label="Outreach today"
          value={checkin?.outreach_count ?? 0}
          hint={saving ? "Saving…" : "Synced"}
          tone="brand"
        />
        <Stat label="Tasks" value={`${doneTasks}/${tasks.length || 0}`} hint="Top 3 for the day" />
        <Stat label="Habits" value={`${habitsDone}/5`} tone={habitsDone === 5 ? "success" : "default"} />
      </div>

      {/* Daily check-in */}
      <Card className="mt-4">
        <CardHeader title="Daily check-in" subtitle="Outreach + habits" />
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-line bg-base/40 p-3">
            <div className="text-sm font-medium text-ink">Outreach count</div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setField("outreach_count", Math.max(0, (checkin?.outreach_count ?? 0) - 1))}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink active:scale-95"
                aria-label="Decrease"
              >
                <Minus className="h-5 w-5" />
              </button>
              <span className="w-10 text-center font-mono text-2xl font-bold tabular-nums">
                {checkin?.outreach_count ?? 0}
              </span>
              <button
                onClick={() => setField("outreach_count", (checkin?.outreach_count ?? 0) + 1)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink active:scale-95"
                aria-label="Increase"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {HABITS.map(({ key, label, Icon }) => {
              const on = !!checkin?.[key];
              return (
                <button
                  key={key}
                  onClick={() => setField(key, !on as never)}
                  className={cn(
                    "flex min-h-[64px] flex-col items-start justify-between rounded-xl border p-3 text-left transition active:scale-[0.98]",
                    on
                      ? "border-success/40 bg-success-soft text-success"
                      : "border-line bg-surface text-ink-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Tasks */}
      <Card className="mt-4">
        <CardHeader title="Top 3 tasks" subtitle={`${doneTasks}/${tasks.length} done`} />
        <CardBody className="space-y-2">
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              {tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => void toggleTask(t.id, !t.done)}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]"
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      t.done ? "border-success bg-success text-white" : "border-line",
                    )}
                  >
                    {t.done && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className={cn("text-sm", t.done ? "text-ink-faint line-through" : "text-ink")}>
                    {t.text}
                  </span>
                </button>
              ))}
              {tasks.length < 3 && (
                <div className="flex gap-2">
                  <input
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void addTask()}
                    placeholder="Add a task…"
                    className="min-h-[44px] flex-1 rounded-xl border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                  />
                  <Button onClick={() => void addTask()} size="md">
                    Add
                  </Button>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* Follow-ups */}
      <Card className="mt-4">
        <CardHeader title="Follow-ups due today" subtitle="From lead reminders" />
        <CardBody className="space-y-2">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : followUps.length === 0 ? (
            <div className="rounded-xl border border-success/30 bg-success-soft p-3 text-sm font-medium text-success">
              All caught up
            </div>
          ) : (
            followUps.map((l) => {
              const message = followUpText(l.stage, l.business_name, l.owner_name);
              const since = l.last_contact_at ? daysSinceSaISOString(l.last_contact_at) : null;
              const isCopied = copiedId === l.id;
              return (
                <div key={l.id} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{l.business_name}</div>
                      <div className="truncate text-xs text-ink-faint">{l.owner_name ?? "—"}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <StageBadge stage={l.stage} />
                        <Badge tone="brand">{followUpLabel(l.follow_up_type)}</Badge>
                        <Badge>
                          {since === null ? "Not contacted" : since === 0 ? "Today" : `${since}d ago`}
                        </Badge>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/leads?lead=${l.id}&tab=messages`)}
                      className="shrink-0 rounded-lg border border-line bg-surface p-2 text-ink-muted active:scale-95"
                      aria-label="Open lead"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => void copyMsg(l.id, message)}
                    className="mt-3 w-full rounded-xl border border-line bg-base/40 p-3 text-left text-sm text-ink active:scale-[0.99]"
                  >
                    <div className="text-xs text-ink-faint">{isCopied ? "Copied ✓" : "Tap to copy"}</div>
                    <div className="mt-1 whitespace-pre-wrap">{message}</div>
                  </button>
                  {isCopied && (
                    <Button block size="md" className="mt-2" onClick={() => void markFollowUpSent(l.id)}>
                      Mark as sent
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      {/* New leads */}
      <Card className="mt-4">
        <CardHeader title="New leads to message" subtitle="Fresh, not contacted" />
        <CardBody className="space-y-2">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : newLeads.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-3 text-sm text-ink-faint">
              Nothing new to message
            </div>
          ) : (
            newLeads.map((l) => {
              const phone = l.phone ? formatZAPhone(l.phone) : "";
              const wa = phone ? `https://wa.me/${phone}` : null;
              const msg = openerText(l.business_name, l.owner_name);
              const isCopied = copiedId === l.id;
              return (
                <div key={l.id} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{l.business_name}</div>
                      <div className="truncate text-xs text-ink-faint">{l.owner_name ?? "—"}</div>
                      {wa ? (
                        <a href={wa} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand">
                          wa.me/{phone}
                        </a>
                      ) : (
                        <div className="mt-1 text-xs text-ink-faint">No phone</div>
                      )}
                    </div>
                    <button
                      onClick={() => navigate(`/leads?lead=${l.id}&tab=messages`)}
                      className="shrink-0 rounded-lg border border-line bg-surface p-2 text-ink-muted active:scale-95"
                      aria-label="Open lead"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => void copyMsg(l.id, msg)}
                    className="mt-3 w-full rounded-xl border border-line bg-base/40 p-3 text-left text-sm text-ink active:scale-[0.99]"
                  >
                    <div className="text-xs text-ink-faint">{isCopied ? "Copied ✓" : "Tap to copy opener"}</div>
                    <div className="mt-1 whitespace-pre-wrap">{msg}</div>
                  </button>
                  {isCopied && (
                    <Button block size="md" className="mt-2" onClick={() => void markNewLeadMessaged(l.id)}>
                      Mark as messaged
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      {/* Pipeline */}
      <Card className="mt-4 mb-2">
        <CardHeader title="Pipeline" subtitle={`${leads.length} leads`} />
        <CardBody className="flex flex-wrap gap-2">
          {pipelineData.map((p) => (
            <div key={p.stage} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
              <StageBadge stage={p.stage} />
              <span className="font-mono text-sm font-bold tabular-nums">{p.count}</span>
            </div>
          ))}
        </CardBody>
      </Card>
    </PageTransition>
  );
}
