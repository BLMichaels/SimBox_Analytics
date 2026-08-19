import { useCallback, useEffect, useMemo, useState } from "react";
import { CountTable } from "../components/CountTable";
import { DashboardCharts } from "../components/DashboardCharts";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { SessionLink } from "../components/SessionLink";
import { StudyLedger } from "../components/StudyLedger";
import { downloadCsv, rangeStamp } from "../lib/csv";
import { formatDuration, formatLocal, formatPercent, formatRange, rangeForPreset } from "../lib/dates";
import { applyClientFilters, fetchCaseEvents } from "../lib/fetchEvents";
import {
  dash,
  eventCsvRow,
  outcomeLabel,
  sessionCsvRow,
  summarizeSessions,
  tally,
  type SessionSummary,
} from "../lib/reporting";
import { supabase } from "../lib/supabase";
import { useLiveReload } from "../lib/useLiveReload";
import type { CaseRecord, DashboardMetrics, Filters } from "../lib/types";

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
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
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
    } else {
      setMetrics(data as DashboardMetrics);
    }

    const fetched = await fetchCaseEvents({
      from: bounds.from,
      to: bounds.to,
      caseIds: filters.caseIds,
      eventTypes: filters.eventTypes,
      deliveryContexts: filters.deliveryContexts,
      deviceTypes: filters.deviceTypes,
    });
    if (fetched.error) {
      setError(fetched.error);
      setSessions([]);
      return;
    }
    const rows = applyClientFilters(fetched.rows, {
      includeNonProduction: filters.includeNonProduction,
      search: filters.search,
    });
    setSessions(summarizeSessions(rows));
  }, [bounds.from, bounds.to, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveReload(load);

  const kpis = metrics.kpis;
  const completionRate =
    !kpis.starts || kpis.starts === 0 ? 0 : Number(kpis.completions) / Number(kpis.starts);
  const completedSessions = sessions.filter((s) => s.outcome === "completed").length;
  const exitedSessions = sessions.filter((s) => s.outcome === "exited").length;
  const inProgress = sessions.filter((s) => s.outcome === "in_progress").length;

  const byGeo = tally(sessions, (s) => s.location);
  const byRegion = tally(sessions, (s) => [s.region, s.country].filter(Boolean).join(", "));
  const bySite = tally(sessions, (s) => (s.site === "Not provided" ? "" : s.site), "Not provided");
  const byAccess = tally(sessions, (s) => s.access, "Unknown");
  const byDevice = tally(sessions, (s) => s.device, "unknown");
  const byCase = (metrics.by_case ?? []).map((c) => ({
    label: c.display_name,
    n: Number(c.starts),
    pct: Number(c.completion_rate),
  }));
  const byStep = (metrics.by_step ?? []).map((s) => ({
    label: s.label,
    n: Number(s.sessions),
    pct: kpis.starts ? Number(s.sessions) / Number(kpis.starts) : 0,
  }));

  const columns: Column<SessionSummary>[] = [
    {
      key: "session",
      header: "Session",
      sortValue: (r) => r.session_id,
      render: (r) => <SessionLink sessionId={r.session_id} />,
    },
    { key: "case", header: "Case", sortValue: (r) => r.case_name, render: (r) => r.case_name },
    {
      key: "started",
      header: "Started",
      sortValue: (r) => r.started_at,
      render: (r) => formatLocal(r.started_at),
    },
    {
      key: "outcome",
      header: "Outcome",
      sortValue: (r) => r.outcome,
      render: (r) => outcomeLabel(r.outcome),
    },
    {
      key: "elapsed",
      header: "Duration",
      sortValue: (r) => r.elapsed_seconds ?? -1,
      render: (r) => formatDuration(r.elapsed_seconds),
    },
    { key: "step", header: "Last step", sortValue: (r) => r.last_step, render: (r) => r.last_step },
    { key: "city", header: "City", sortValue: (r) => r.city, render: (r) => dash(r.city) },
    { key: "region", header: "State / region", sortValue: (r) => r.region, render: (r) => dash(r.region) },
    { key: "postal", header: "Postal", sortValue: (r) => r.postal, render: (r) => dash(r.postal) },
    { key: "country", header: "Country", sortValue: (r) => r.country, render: (r) => dash(r.country) },
    { key: "site", header: "Site", sortValue: (r) => r.site, render: (r) => r.site },
    { key: "access", header: "Access", sortValue: (r) => r.access, render: (r) => r.access },
    { key: "device", header: "Device", sortValue: (r) => r.device, render: (r) => r.device },
    {
      key: "events",
      header: "Actions",
      sortValue: (r) => r.event_count,
      render: (r) => String(r.event_count),
    },
  ];

  function exportSessions() {
    downloadCsv(`simbox-sessions-${rangeStamp(bounds.from, bounds.to)}.csv`, sessions.map(sessionCsvRow));
  }

  function exportEvents() {
    downloadCsv(
      `simbox-events-${rangeStamp(bounds.from, bounds.to)}.csv`,
      sessions.flatMap((s) => s.events.map((e) => eventCsvRow(e))),
    );
  }

  return (
    <div>
      <header className="mb-6 border-b border-ink pb-5">
        <p className="text-[11px] font-medium tracking-[0.18em] text-teal uppercase">Study extract</p>
        <h1 className="font-serif mt-1 text-3xl text-ink">Overview</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
          Anonymous SimBox usage for {formatRange(bounds.from, bounds.to)}. Counts are session-based.
          Times display in your local timezone; stored timestamps are UTC. Click a session ID for the
          full action progression.
        </p>
      </header>
      <FilterBar cases={cases} filters={filters} onChange={setFilters} showEventFilter showSearch compact />
      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <StudyLedger
        items={[
          { label: "Starts", value: String(kpis.starts ?? 0), hint: "case_started events" },
          { label: "Completions", value: String(kpis.completions ?? 0), hint: "Last numbered step reached" },
          { label: "Completion rate", value: formatPercent(completionRate), hint: "Completions ÷ starts" },
          { label: "Exits", value: String(kpis.exits ?? 0), hint: "Left before completion" },
          { label: "Sessions", value: String(kpis.unique_sessions ?? sessions.length), hint: "Anonymous session IDs" },
          {
            label: "Median duration",
            value: formatDuration(kpis.median_completion_seconds),
            hint: "Among completions",
          },
          {
            label: "Mean duration",
            value: formatDuration(kpis.avg_completion_seconds),
            hint: "Among completions",
          },
          { label: "Active cases", value: String(kpis.active_cases ?? 0), hint: "With ≥1 start in range" },
        ]}
      />

      <p className="mt-2 mb-6 text-[11px] text-ink-soft">
        Session outcomes in this extract: {completedSessions} completed, {exitedSessions} exited, {inProgress} in
        progress. Named user and hospital are not collected from the player. City, state, and postal
        come from IP geolocation (the IP itself is not stored). Site code appears only when the
        case URL includes <code className="font-mono">?simbox_site=</code>.
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <CountTable
          title="By case"
          caption="Completion rate is completions ÷ starts for that case."
          rows={byCase}
          nLabel="Starts"
          percentLabel="Completion rate"
          empty="No case activity in this range."
        />
        <CountTable
          title="By locality"
          caption="City, region, postal, and country from IP geolocation at ingest. The IP is not stored. Older events may show Not resolved."
          rows={byGeo}
          empty="No session locality in this range."
        />
        <CountTable
          title="By state / country"
          rows={byRegion}
          empty="No region data in this range."
        />
        <CountTable
          title="By site code"
          caption="Optional hospital or program code from the case URL. Not a named institution."
          rows={bySite}
          empty="No site codes in this range."
        />
        <CountTable title="By access" rows={byAccess} empty="No access mix in this range." />
        <CountTable title="By device" rows={byDevice} empty="No device mix in this range." />
      </div>

      <div className="mt-4">
        <CountTable
          title="Sessions reaching each step"
          caption="% of starts in this range. Dual last steps (for example BSSA / SAFE-T) both count as completion."
          rows={byStep}
          empty="No step checkpoints in this range. Older events may predate step tracking."
        />
      </div>

      <div className="mt-4">
        <DashboardCharts metrics={metrics} />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-ink">Sessions</h2>
            <p className="mt-1 text-sm text-ink-soft">
              One row per anonymous session. Open a session to read every action as a progression.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="border border-line bg-card px-3 py-1.5 text-sm" onClick={exportEvents}>
              Export event log
            </button>
            <button type="button" className="bg-ink px-3 py-1.5 text-sm text-card" onClick={exportSessions}>
              Export session table
            </button>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={sessions}
          rowKey={(r) => r.session_id}
          pageSize={20}
          compact
          emptyTitle="No sessions in this range"
          emptyBody="Adjust the study period or filters, or confirm tracking is reaching the intake function."
        />
      </section>
    </div>
  );
}
