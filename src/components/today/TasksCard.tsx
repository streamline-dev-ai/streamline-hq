import { cn } from "@/lib/utils";
import Card from "@/components/today/Card";

export type TodayTask = {
  id: string;
  text: string;
  done: boolean;
};

export default function TasksCard(props: {
  loading: boolean;
  tasks: TodayTask[];
  newTaskText: string;
  setNewTaskText: (v: string) => void;
  onAdd: () => void;
  onToggle: (id: string, done: boolean) => void;
}) {
  return (
    <Card title="Top 3 tasks">
      <div className="space-y-2">
        {props.loading ? (
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded-xl bg-white/5" />
            <div className="h-10 animate-pulse rounded-xl bg-white/5" />
            <div className="h-10 animate-pulse rounded-xl bg-white/5" />
          </div>
        ) : (
          <>
            {props.tasks.map((t) => (
              <label
                key={t.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-base px-3 py-3 text-sm transition hover:bg-white/5",
                  t.done && "opacity-70",
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-purple"
                  checked={t.done}
                  onChange={(e) => props.onToggle(t.id, e.target.checked)}
                />
                <span className={cn("min-w-0 flex-1", t.done && "line-through text-zinc-400")}>{t.text}</span>
              </label>
            ))}

            {props.tasks.length < 3 ? (
              <div className="flex items-center gap-2">
                <input
                  value={props.newTaskText}
                  onChange={(e) => props.setNewTaskText(e.target.value)}
                  placeholder="Add a task…"
                  className="h-11 w-full rounded-xl border border-border bg-base px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-purple"
                />
                <button
                  type="button"
                  onClick={props.onAdd}
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-purple px-4 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  Add
                </button>
              </div>
            ) : (
              <div className="text-xs text-zinc-500">You’ve hit your 3-task cap for today.</div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

