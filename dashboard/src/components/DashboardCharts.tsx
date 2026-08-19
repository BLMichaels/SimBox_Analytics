import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardMetrics } from "../lib/types";
import { formatPercent } from "../lib/dates";

const TEAL = "#1f6a66";
const INK = "#1c2430";
const COPPER = "#9a4f2c";
const PAPER = "#d4cdc0";

type Props = { metrics: DashboardMetrics };

export function DashboardCharts({ metrics }: Props) {
  const daily = metrics.daily.map((d) => ({
    day: new Date(d.day_utc).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    starts: Number(d.starts),
    completions: Number(d.completions),
  }));

  const byCase = metrics.by_case.map((c) => ({
    name: c.display_name,
    starts: Number(c.starts),
    completions: Number(c.completions),
    rate: Number(c.completion_rate),
  }));

  const delivery = metrics.by_delivery.map((d) => ({
    name:
      d.key === "github_direct" ? "GitHub direct" : d.key === "wix_embedded" ? "Wix embed" : "Unknown",
    value: Number(d.n),
  }));

  const device = metrics.by_device.map((d) => ({
    name: d.key,
    value: Number(d.n),
  }));

  const pieColors = [TEAL, INK, COPPER, PAPER];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard title="Daily starts and completions">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={daily} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid stroke={PAPER} vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="starts" stroke={TEAL} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="completions" stroke={COPPER} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Usage by case">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byCase} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid stroke={PAPER} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="starts" fill={TEAL} />
            <Bar dataKey="completions" fill={INK} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Completion rate by case">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byCase} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid stroke={PAPER} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => formatPercent(Number(v))} />
            <Bar dataKey="rate" fill={TEAL} name="Completion rate" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Wix embedded vs GitHub direct">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={delivery} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
              {delivery.map((_, i) => (
                <Cell key={i} fill={pieColors[i % pieColors.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Device mix">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={device} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
              {device.map((_, i) => (
                <Cell key={i} fill={pieColors[i % pieColors.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Sessions reaching each step">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={(metrics.by_step ?? []).map((s) => ({
              name: s.label,
              sessions: Number(s.sessions),
            }))}
            margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
          >
            <CartesianGrid stroke={PAPER} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="sessions" fill={TEAL} name="Sessions" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-line bg-card p-4">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <div className="mt-2 h-[260px]">{children}</div>
    </section>
  );
}
