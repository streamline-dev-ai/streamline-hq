import { cn } from "@/lib/utils";

export interface SegOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

// Horizontal scrollable filter switch — thumb-friendly on mobile.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 scroll-touch",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-95",
              active
                ? "border-brand/40 bg-brand-soft text-brand"
                : "border-line bg-surface text-ink-muted hover:text-ink",
            )}
          >
            {o.label}
            {o.count != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-brand/20" : "bg-white/5 text-ink-faint",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
