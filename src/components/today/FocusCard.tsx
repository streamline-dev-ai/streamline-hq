import Card from "@/components/today/Card";

export default function FocusCard(props: { onAdd5: () => void; onPlan: () => void }) {
  return (
    <Card title="Focus">
      <div className="rounded-xl border border-orange/40 bg-orange/10 p-4">
        <div className="text-sm font-semibold text-orange">Today’s CTA</div>
        <div className="mt-1 text-sm text-zinc-200">Do 10 outreach touches before lunch.</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onAdd5}
            className="inline-flex items-center justify-center rounded-xl bg-orange px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            +5 touches
          </button>
          <button
            type="button"
            onClick={props.onPlan}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-base px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
          >
            Plan follow-ups
          </button>
        </div>
      </div>
      <div className="mt-3 text-xs text-zinc-500">Works offline once installed. Data syncs when you’re back online.</div>
    </Card>
  );
}

