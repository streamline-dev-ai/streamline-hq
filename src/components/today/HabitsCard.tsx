import { cn } from "@/lib/utils";
import Card from "@/components/today/Card";

export type TodayHabits = {
  morning_routine: boolean;
  workout: boolean;
  no_scroll: boolean;
  no_smoking: boolean;
  tasks_written: boolean;
};

export default function HabitsCard(props: {
  loading: boolean;
  habits: TodayHabits | null;
  onToggle: (key: keyof TodayHabits, value: boolean) => void;
  localSixthHabit: boolean;
  setLocalSixthHabit: (v: boolean) => void;
}) {
  const preset = [
    { key: "morning_routine", label: "Morning routine" },
    { key: "workout", label: "Workout" },
    { key: "no_scroll", label: "No scroll" },
    { key: "no_smoking", label: "No smoking" },
    { key: "tasks_written", label: "Tasks written" },
  ] as const;

  return (
    <Card title="Habits (6)" right={<div className="text-xs text-zinc-400">Tap to toggle</div>}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {preset.map((h) => {
          const checked = props.habits ? Boolean(props.habits[h.key]) : false;
          return (
            <label
              key={h.key}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-base px-3 py-3 text-sm transition hover:bg-white/5"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-purple"
                checked={checked}
                disabled={!props.habits || props.loading}
                onChange={(e) => props.onToggle(h.key, e.target.checked)}
              />
              <span className={cn("min-w-0 flex-1", checked && "text-zinc-200")}>{h.label}</span>
            </label>
          );
        })}

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-base px-3 py-3 text-sm transition hover:bg-white/5">
          <input
            type="checkbox"
            className="h-4 w-4 accent-orange"
            checked={props.localSixthHabit}
            onChange={(e) => props.setLocalSixthHabit(e.target.checked)}
          />
          <span className={cn("min-w-0 flex-1", props.localSixthHabit && "text-zinc-200")}>Client outreach planned</span>
        </label>
      </div>
    </Card>
  );
}

