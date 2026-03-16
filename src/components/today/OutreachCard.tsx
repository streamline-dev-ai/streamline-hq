import { Minus, Plus } from "lucide-react";
import Card from "@/components/today/Card";

function formatCount(n: number) {
  return new Intl.NumberFormat("en-ZA").format(n);
}

export default function OutreachCard(props: {
  value: number;
  loading: boolean;
  savingLabel: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <Card title="Outreach" right={<div className="text-xs text-zinc-400">{props.savingLabel}</div>}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{formatCount(props.value)}</div>
          <div className="mt-1 text-sm text-zinc-400">Tap to adjust</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={props.loading}
            onClick={props.onDec}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-base text-zinc-200 transition hover:bg-white/5 disabled:opacity-50"
            aria-label="Decrease outreach"
          >
            <Minus className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled={props.loading}
            onClick={props.onInc}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-purple text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            aria-label="Increase outreach"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </Card>
  );
}

