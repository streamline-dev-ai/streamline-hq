import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clipboard, RefreshCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { getSaDateString } from "@/utils/saDate";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useLocalStorageBoolean } from "@/hooks/useLocalStorageBoolean";
import OutreachCard from "@/components/today/OutreachCard";
import TasksCard, { type TodayTask } from "@/components/today/TasksCard";
import HabitsCard, { type TodayHabits } from "@/components/today/HabitsCard";
import PipelineCard from "@/components/today/PipelineCard";
import FocusCard from "@/components/today/FocusCard";

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

type TaskRow = {
  id: string;
  date: string;
  text: string;
  done: boolean;
};

type LeadRow = {
  id: string;
  stage: string | null;
};

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

export default function Today() {
  const saDate = useMemo(() => getSaDateString(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkin, setCheckin] = useState<DailyCheckinRow | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localSixthHabit, setLocalSixthHabit] = useLocalStorageBoolean(`streamline-hq:${saDate}:client-outreach-planned`, false);
  const lastSavedRef = useRef<string | null>(null);
  const debouncedCheckin = useDebouncedValue(checkin, 350);

  const pipelineData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const stage = (lead.stage ?? "Unstaged").trim() || "Unstaged";
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
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
        .insert({
          date: saDate,
          outreach_count: 0,
          no_scroll: false,
          no_smoking: false,
          morning_routine: false,
          workout: false,
          tasks_written: false,
        })
        .select("*")
        .single();

      if (!insertRes.error) return insertRes.data as DailyCheckinRow;

      const retryRes = await supabase.from("daily_checkins").select("*").eq("date", saDate).maybeSingle();
      if (retryRes.error) throw retryRes.error;
      if (!retryRes.data) throw insertRes.error;
      return retryRes.data as DailyCheckinRow;
    })();

    const tasksPromise = supabase.from("tasks").select("*").eq("date", saDate).order("done", { ascending: true }).limit(3);
    const leadsPromise = supabase.from("leads").select("id, stage");

    try {
      const [checkinRow, tasksRes, leadsRes] = await Promise.all([checkinPromise, tasksPromise, leadsPromise]);
      if (tasksRes.error) throw tasksRes.error;
      if (leadsRes.error) throw leadsRes.error;

      lastSavedRef.current = snapshotCheckin(checkinRow);
      setCheckin(checkinRow);
      setTasks((tasksRes.data ?? []) as TaskRow[]);
      setLeads((leadsRes.data ?? []) as LeadRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      setError(msg);
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_checkins", filter: `date=eq.${saDate}` },
        () => {
          supabase
            .from("daily_checkins")
            .select("*")
            .eq("date", saDate)
            .maybeSingle()
            .then((r) => {
              if (!r.data) return;
              lastSavedRef.current = snapshotCheckin(r.data as DailyCheckinRow);
              setCheckin(r.data as DailyCheckinRow);
            });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `date=eq.${saDate}` },
        () => {
          supabase
            .from("tasks")
            .select("*")
            .eq("date", saDate)
            .order("done", { ascending: true })
            .limit(3)
            .then((r) => {
              if (r.data) setTasks(r.data as TaskRow[]);
            });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        supabase
          .from("leads")
          .select("id, stage")
          .then((r) => {
            if (r.data) setLeads(r.data as LeadRow[]);
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [saDate]);

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

  function setCheckinField<K extends keyof DailyCheckinRow>(key: K, value: DailyCheckinRow[K]) {
    setCheckin((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
  }

  async function addTask() {
    const text = newTaskText.trim();
    if (!text) return;
    if (tasks.length >= 3) return;

    setNewTaskText("");
    const res = await supabase.from("tasks").insert({ date: saDate, text, done: false }).select("*").single();
    if (!res.error && res.data) {
      setTasks((prev) => [...prev, res.data as TaskRow].slice(0, 3));
      return;
    }
    await loadAll();
  }

  async function toggleTaskDone(id: string, done: boolean) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)));
    const res = await supabase.from("tasks").update({ done }).eq("id", id);
    if (res.error) await loadAll();
  }

  async function copyQuickSummary() {
    const outreach = checkin?.outreach_count ?? 0;
    const doneTasks = tasks.filter((t) => t.done).length;
    const habitsDone =
      (checkin?.no_scroll ? 1 : 0) +
      (checkin?.no_smoking ? 1 : 0) +
      (checkin?.morning_routine ? 1 : 0) +
      (checkin?.workout ? 1 : 0) +
      (checkin?.tasks_written ? 1 : 0) +
      (localSixthHabit ? 1 : 0);

    const msg = `Streamline HQ (${saDate})\nOutreach: ${outreach}\nTasks: ${doneTasks}/${tasks.length}\nHabits: ${habitsDone}/6`;

    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      return;
    }
  }

  const habits: TodayHabits | null = checkin
    ? {
        morning_routine: checkin.morning_routine,
        workout: checkin.workout,
        no_scroll: checkin.no_scroll,
        no_smoking: checkin.no_smoking,
        tasks_written: checkin.tasks_written,
      }
    : null;

  const mappedTasks: TodayTask[] = tasks.map((t) => ({ id: t.id, text: t.text, done: t.done }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-zinc-400">Today</div>
          <div className="text-lg font-semibold tracking-tight">{saDate}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/5"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void copyQuickSummary()}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
              copied ? "bg-emerald-500/15 text-emerald-300" : "bg-purple/15 text-purple hover:bg-purple/25",
            )}
          >
            {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-orange/40 bg-orange/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-orange" />
            <div>
              <div className="text-sm font-semibold">Couldn’t load today</div>
              <div className="mt-1 text-sm text-zinc-300">{error}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <OutreachCard
          value={checkin?.outreach_count ?? 0}
          loading={!checkin || loading}
          savingLabel={saving ? "Saving…" : loading ? "Loading…" : "Synced"}
          onDec={() => {
            const next = Math.max(0, (checkin?.outreach_count ?? 0) - 1);
            setCheckinField("outreach_count", next);
          }}
          onInc={() => {
            const next = (checkin?.outreach_count ?? 0) + 1;
            setCheckinField("outreach_count", next);
          }}
        />

        <TasksCard
          loading={loading}
          tasks={mappedTasks}
          newTaskText={newTaskText}
          setNewTaskText={setNewTaskText}
          onAdd={() => void addTask()}
          onToggle={(id, done) => void toggleTaskDone(id, done)}
        />

        <HabitsCard
          loading={loading}
          habits={habits}
          onToggle={(key, value) => setCheckinField(key, value)}
          localSixthHabit={localSixthHabit}
          setLocalSixthHabit={setLocalSixthHabit}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PipelineCard data={pipelineData} />
        <FocusCard
          onAdd5={() => {
            if (!checkin) return;
            setCheckinField("outreach_count", (checkin.outreach_count ?? 0) + 5);
          }}
          onPlan={() => setLocalSixthHabit(true)}
        />
      </div>
    </div>
  );
}

