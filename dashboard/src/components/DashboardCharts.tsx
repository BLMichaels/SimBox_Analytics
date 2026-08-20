import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CountRow } from "../lib/reporting";
import type { DashboardMetrics } from "../lib/types";

const TEAL = "#1f6a66";
const COPPER = "#9a4f2c";
const GOLD = "#c4a35a";
const PAPER = "#d4cdc0";

type Props = {
  metrics: DashboardMetrics;
  funnel?: CountRow[];
  durations?: CountRow[];
  weekdays?: CountRow[];
  hours?: CountRow[];
};

export function DashboardCharts({ metrics, funnel, durations, weekdays, hours }: Props) {
  const daily = metrics.daily.map((d) => ({
    day: new Date(d.day_utc).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    starts: Number(d.starts),
    completions: Number(d.completions),
  }));
  const funnelData = (funnel ?? []).map((r) => ({ label: r.label, sessions: r.n, rate: Math.round(r.pct * 1000) / 10 }));
  const durationData = (durations ?? []).map((r) => ({ label: r.label, sessions: r.n }));
  const weekdayData = (weekdays ?? []).map((r) => ({ label: r.label.slice(0, 3), sessions: r.n }));
  const hourData = (hours ?? []).map((r) => ({ label: r.label.replace(/\s*\(.*/, ""), sessions: r.n }));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard
        title="Daily starts and completions"
        caption="UTC calendar day of session start. Completions are counted on the start day."
        rows={daily.map((d) => ({ label: d.day, values: [`${d.starts} starts`, `${d.completions} completed`] }))}
      >
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
      {funnelData.length ? (
        <ChartCard
          title="Progression funnel"
          caption="Sessions that reached each recorded step in this range."
          rows={funnelData.map((r) => ({ label: r.label, values: [`${r.sessions} sessions`, `${r.rate}%`] }))}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={funnelData} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid stroke={PAPER} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
              <Tooltip />
              <Bar dataKey="sessions" name="Sessions" fill={TEAL} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {durationData.length ? (
        <ChartCard
          title="Time to complete or exit"
          caption="Elapsed time when recorded; otherwise wall-clock from first to last action."
          rows={durationData.map((r) => ({ label: r.label, values: [`${r.sessions}`] }))}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={durationData} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid stroke={PAPER} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
              <Tooltip />
              <Bar dataKey="sessions" name="Sessions" fill={COPPER} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {weekdayData.length ? (
        <ChartCard
          title="Starts by weekday"
          caption="Local timezone of this browser, not the learner timezone."
          rows={weekdayData.map((r) => ({ label: r.label, values: [`${r.sessions}`] }))}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weekdayData} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid stroke={PAPER} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
              <Tooltip />
              <Bar dataKey="sessions" name="Starts" fill={GOLD} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {hourData.length ? (
        <ChartCard
          title="Starts by time of day"
          caption="Local timezone of this browser, not the learner timezone."
          wide={!weekdayData.length}
          rows={hourData.map((r) => ({ label: r.label, values: [`${r.sessions}`] }))}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hourData} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid stroke={PAPER} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
              <Tooltip />
              <Bar dataKey="sessions" name="Starts" fill={TEAL} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
    </div>
  );
}

function ChartCard({
  title,
  caption,
  children,
  wide,
  rows,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
  wide?: boolean;
  rows: Array<{ label: string; values: string[] }>;
}) {
  return (
    <section className={["border border-line bg-card p-4", wide ? "xl:col-span-2" : ""].join(" ")}>
      <h3 className="font-serif text-lg text-ink">{title}</h3>
      {caption ? <p className="mt-0.5 text-[11px] text-ink-soft">{caption}</p> : null}
      <div className="mt-2 h-[240px]" aria-hidden>
        {children}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-ink-soft">Data table</summary>
        <table className="mt-2 min-w-full text-left text-xs">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th scope="row" className="py-1 pr-3 font-medium">
                  {row.label}
                </th>
                {row.values.map((v) => (
                  <td key={v} className="py-1 font-mono tabular-nums">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
