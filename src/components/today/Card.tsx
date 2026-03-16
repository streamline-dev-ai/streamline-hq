import type { ReactNode } from "react";

export default function Card(props: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{props.title}</div>
        {props.right}
      </div>
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

