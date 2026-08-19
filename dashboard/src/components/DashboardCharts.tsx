import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardMetrics } from "../lib/types";

const TEAL = "#1f6a66";
const COPPER = "#9a4f2c";
const PAPER = "#d4cdc0";

type Props = { metrics: DashboardMetrics };

export function DashboardCharts({ metrics }: Props) {
  const daily = metrics.daily.map((d) => ({
    day: new Date(d.day_utc).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    starts: Number(d.starts),
    completions: Number(d.completions),
  }));

  return (
    <ChartCard title="Daily starts and completions" caption="UTC calendar days. Completions may land on a later day than the start.">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={daily} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
          <CartesianGrid stroke={PAPER} vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
          <Tooltip />
          <Line type="monotone" dataKey="starts" name="Starts" stroke={TEAL} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="completions" name="Completions" stroke={COPPER} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ChartCard({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  return (
    <section className="border border-line bg-card p-4">
      <h3 className="font-serif text-lg text-ink">{title}</h3>
      {caption ? <p className="mt-0.5 text-[11px] text-ink-soft">{caption}</p> : null}
      <div className="mt-2 h-[240px]">{children}</div>
    </section>
  );
}
