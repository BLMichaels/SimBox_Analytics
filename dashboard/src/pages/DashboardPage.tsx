import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterBar } from "../components/FilterBar";
import { KpiCard } from "../components/KpiCard";
import { DashboardCharts } from "../components/DashboardCharts";
import { DataTable, type Column } from "../components/DataTable";
import { downloadCsv, rangeStamp } from "../lib/csv";
import { formatDuration, formatLocal, formatPercent, rangeForPreset, shortSession } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { useLiveReload } from "../lib/useLiveReload";
import type { CaseEventRecord, CaseRecord, DashboardMetrics, Filters } from "../lib/types";

function emptyMetrics(): DashboardMetrics {
  return {
    kpis: {
      starts: 0,
      completions: 0,
      exits: 0,
      unique_sessions: 0,
      active_cases: 0,
      avg_completion_seconds: null,
      median_completion_seconds: null,
    },
    daily: [],
    by_case: [],
    by_delivery: [],
    by_device: [],
    by_step: [],
  };
}

export function DashboardPage() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics());
  const [recent, setRecent] = useState<CaseEventRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => {
    const { from, to } = rangeForPreset("last30");
    return {
      preset: "last30",
      from,
      to,
      caseIds: [],
      eventTypes: [],
      deliveryContexts: [],
      deviceTypes: [],
      search: "",
      includeNonProduction: true,
    };
  });

  const bounds = useMemo(
    () => (filters.preset === "custom" ? { from: filters.from, to: filters.to } : rangeForPreset(filters.preset)),
    [filters.from, filters.preset, filters.to],
  );

  useEffect(() => {
    void supabase
      .from("cases")
      .select("*")
      .order("display_name")
      .then(({ data, error: err }) => {
        if (err) setError("Unable to load cases.");
        else setCases((data ?? []) as CaseRecord[]);
      });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase.rpc("admin_filtered_metrics", {
      p_from: bounds.from.toISOString(),
      p_to: new Date(bounds.to.getTime() + 1).toISOString(),
      p_case_ids: filters.caseIds.length ? filters.caseIds : null,
      p_event_types: filters.eventTypes.length ? filters.eventTypes : null,
      p_delivery_contexts: filters.deliveryContexts.length ? filters.deliveryContexts : null,
      p_device_types: filters.deviceTypes.length ? filters.deviceTypes : null,
      p_include_nonproduction: filters.includeNonProduction,
    });
    if (err || !data) {
      setError("Unable to load metrics for this range.");
      setMetrics(emptyMetrics());
      return;
    }
    setMetrics(data as DashboardMetrics);

    let q = supabase
      .from("case_events")
      .select("*, cases(case_key, display_name, active)")
      .gte("occurred_at", bounds.from.toISOString())
      .lt("occurred_at", new Date(bounds.to.getTime() + 1).toISOString())
      .order("occurred_at", { ascending: false })
      .limit(50);
    if (filters.caseIds.length) q = q.in("case_id", filters.caseIds);
    if (filters.eventTypes.length) q = q.in("event_type", filters.eventTypes);
    if (filters.deliveryContexts.length) q = q.in("delivery_context", filters.deliveryContexts);
    if (filters.deviceTypes.length) q = q.in("device_type", filters.deviceTypes);
    const recentRes = await q;
    if (recentRes.error) {
      setRecent([]);
      return;
    }
    let rows = (recentRes.data ?? []) as CaseEventRecord[];
    if (!filters.includeNonProduction) {
      rows = rows.filter((r) => (r.metadata?.environment ?? "production") === "production");
    }
    if (filters.search.trim()) {
      const s = filters.search.trim().toLowerCase();
      rows = rows.filter((r) => {
        const name = r.cases?.display_name ?? "";
        const key = r.cases?.case_key ?? "";
        return (
          name.toLowerCase().includes(s) ||
          key.toLowerCase().includes(s) ||
          r.session_id.toLowerCase().includes(s)
        );
      });
    }
    setRecent(rows);
  }, [bounds.from, bounds.to, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveReload(load);

  const kpis = metrics.kpis;
  const completionRate =
    !kpis.starts || kpis.starts === 0 ? 0 : Number(kpis.completions) / Number(kpis.starts);

  const columns: Column<CaseEventRecord>[] = [
    {
      key: "occurred_at",
      header: "Local date/time",
      sortValue: (r) => r.occurred_at,
      render: (r) => formatLocal(r.occurred_at),
    },
    {
      key: "case",
      header: "Case",
      sortValue: (r) => r.cases?.display_name ?? "",
      render: (r) => r.cases?.display_name ?? "—",
    },
    {
      key: "event",
      header: "Event",
      sortValue: (r) => r.event_type,
      render: (r) => r.event_type.replace("case_", ""),
    },
    {
      key: "session",
      header: "Session",
      sortValue: (r) => r.session_id,
      render: (r) => (
        <span className="font-mono text-xs" title={r.session_id}>
          {shortSession(r.session_id)}
        </span>
      ),
    },
    {
      key: "elapsed",
      header: "Elapsed",
      sortValue: (r) => r.elapsed_seconds ?? -1,
      render: (r) => formatDuration(r.elapsed_seconds),
    },
    {
      key: "delivery",
      header: "Access",
      sortValue: (r) => r.delivery_context ?? "",
      render: (r) =>
        r.delivery_context === "wix_embedded"
          ? "Wix embed"
          : r.delivery_context === "github_direct"
            ? "GitHub direct"
            : r.delivery_context ?? "—",
    },
    {
      key: "device",
      header: "Device",
      sortValue: (r) => r.device_type ?? "",
      render: (r) => r.device_type ?? "—",
    },
  ];

  function exportCsv() {
    downloadCsv(`simbox-overview-${rangeStamp(bounds.from, bounds.to)}.csv`, recent.map(toCsvRow));
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">Overview</h1>
        <p className="mt-1 text-sm text-ink-soft">Anonymous aggregate use of SimBox cases. Times display in your local timezone; the database stores UTC.</p>
      </header>
      <FilterBar
        cases={cases}
        filters={filters}
        onChange={setFilters}
        showEventFilter
        showSearch
      />
      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Starts" value={String(kpis.starts ?? 0)} />
        <KpiCard label="Completions" value={String(kpis.completions ?? 0)} />
        <KpiCard label="Completion rate" value={formatPercent(completionRate)} hint="Completions ÷ starts" />
        <KpiCard label="Unique anonymous sessions" value={String(kpis.unique_sessions ?? 0)} />
        <KpiCard
          label="Median completion duration"
          value={formatDuration(kpis.median_completion_seconds)}
        />
        <KpiCard label="Active cases in period" value={String(kpis.active_cases ?? 0)} />
      </div>
      <DashboardCharts metrics={metrics} />
      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="font-serif text-2xl text-ink">Recent activity</h2>
          <button type="button" className="border border-line bg-card px-3 py-1.5 text-sm" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
        <DataTable
          columns={columns}
          rows={recent}
          rowKey={(r) => r.id}
          emptyTitle="No activity in this range"
          emptyBody="Adjust the date range or filters, or confirm tracking is reaching the intake function."
        />
      </section>
    </div>
  );
}

function toCsvRow(r: CaseEventRecord): Record<string, string | number | null> {
  return {
    local_timestamp: formatLocal(r.occurred_at),
    utc_timestamp: r.occurred_at,
    case_name: r.cases?.display_name ?? "",
    case_key: r.cases?.case_key ?? "",
    event: r.event_type,
    session_id: r.session_id,
    elapsed_seconds: r.elapsed_seconds,
    access_context: r.delivery_context,
    device: r.device_type,
  };
}
