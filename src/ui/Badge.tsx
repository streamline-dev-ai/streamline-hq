import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "accent" | "success" | "danger" | "warn";

const TONES: Record<Tone, string> = {
  neutral: "border-line bg-surface text-ink-muted",
  brand: "border-brand/30 bg-brand-soft text-brand",
  accent: "border-accent/30 bg-accent-soft text-accent",
  success: "border-success/30 bg-success-soft text-success",
  danger: "border-danger/30 bg-danger-soft text-danger",
  warn: "border-warn/30 bg-warn-soft text-warn",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// Maps a lead stage to a tone + label.
export const STAGE_META: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "neutral" },
  messaged: { label: "Messaged", tone: "brand" },
  replied: { label: "Replied", tone: "accent" },
  demo_sent: { label: "Demo sent", tone: "warn" },
  proposal_sent: { label: "Proposal", tone: "warn" },
  closed: { label: "Closed", tone: "success" },
  lost: { label: "Lost", tone: "danger" },
  no_whatsapp: { label: "No WhatsApp", tone: "neutral" },
};

export function StageBadge({ stage }: { stage: string | null }) {
  const m = STAGE_META[(stage ?? "new").toLowerCase()] ?? {
    label: stage ?? "—",
    tone: "neutral" as Tone,
  };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
