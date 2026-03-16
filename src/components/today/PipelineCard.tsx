import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import Card from "@/components/today/Card";

function formatCount(n: number) {
  return new Intl.NumberFormat("en-ZA").format(n);
}

export default function PipelineCard(props: { data: { stage: string; count: number }[] }) {
  return (
    <Card title="Mini pipeline" right={<div className="text-xs text-zinc-400">Leads by stage</div>}>
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={props.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="stage" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.06)" }}
              contentStyle={{ background: "#0f0f14", border: "1px solid #23232b", borderRadius: 12, color: "#e4e4e7" }}
              labelStyle={{ color: "#a1a1aa" }}
            />
            <Bar dataKey="count" radius={[10, 10, 0, 0]} fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {props.data.map((p) => (
          <div key={p.stage} className="rounded-xl border border-border bg-base px-3 py-2">
            <div className="truncate text-xs text-zinc-400">{p.stage}</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums">{formatCount(p.count)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

