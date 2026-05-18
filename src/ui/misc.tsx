import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight text-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-fade-up">{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "brand" | "success" | "danger" | "accent" | "warn";
  className?: string;
}) {
  const toneCls = {
    default: "text-ink",
    brand: "text-brand",
    success: "text-success",
    danger: "text-danger",
    accent: "text-accent",
    warn: "text-warn",
  }[tone];
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface p-4",
        className,
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", toneCls)}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-faint">{icon}</div>}
      <div className="text-sm font-semibold text-ink">{title}</div>
      {body && <div className="mt-1 max-w-xs text-sm text-ink-faint">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-white/[0.04]",
        className,
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
    </div>
  );
}
