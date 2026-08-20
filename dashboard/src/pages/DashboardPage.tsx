import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaseLink, OutcomeBadge } from "../components/CaseLink";
import { CountTable } from "../components/CountTable";
import { DashboardCharts } from "../components/DashboardCharts";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { SessionLink } from "../components/SessionLink";
import { StudyLedger } from "../components/StudyLedger";
import { downloadCsv, rangeStamp } from "../lib/csv";
import { formatDuration, formatLocal, formatPercent, formatRange } from "../lib/dates";
import { applyClientFilters, fetchCaseEvents } from "../lib/fetchEvents";
import { useStudyFilters } from "../lib/FilterProvider";
import {
  dash,
  durationBuckets,
  eventCsvRow,
  funnelFromSessions,
  hourMix,
  outcomeMix,
  sessionCsvRow,
  summarizeSessions,
  tally,
  weekdayMix,
  type SessionSummary,
} from "../lib/reporting";
import { supabase } from "../lib/supabase";
import { useLiveReload } from "../lib/useLiveReload";
import type { DashboardMetrics } from "../lib/types";

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
  const navigate = useNavigate();
  const { filters, setFilters, bounds, cases } = useStudyFilters();
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics());
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

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
  const funnel = useMemo(() => funnelFromSessions(sessions), [sessions]);
  const durations = useMemo(() => durationBuckets(sessions), [sessions]);
  const weekdays = useMemo(() => weekdayMix(sessions), [sessions]);
  const hours = useMemo(() => hourMix(sessions), [sessions]);

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

  const columns: Column<SessionSummary>[] = [
    {
      key: "session",
      header: "Session",
      sortValue: (r) => r.session_id,
      render: (r) => <SessionLink sessionId={r.session_id} />,
    },
    {
      key: "case",
      header: "Case",
      sortValue: (r) => r.case_name,
      render: (r) => <CaseLink caseKey={r.case_key}>{r.case_name}</CaseLink>,
    },
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
      render: (r) => <OutcomeBadge outcome={r.outcome} />,
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
    { key: "country", header: "Country", sortValue: (r) => r.country, render: (r) => dash(r.country) },
    { key: "site", header: "Site", sortValue: (r) => r.site, render: (r) => r.site },
    { key: "access", header: "Access", sortValue: (r) => r.access, render: (r) => r.access },
    { key: "device", header: "Device", sortValue: (r) => r.device, render: (r) => r.device },
  ];

  return (
    <div>
      <header className="mb-6 border-b border-ink pb-5">
        <p className="text-[11px] font-medium tracking-[0.18em] text-teal uppercase">Study extract</p>
        <h1 className="font-serif mt-1 text-3xl text-ink">Overview</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
          Anonymous SimBox usage for {formatRange(bounds.from, bounds.to)}. Click a case, place, or session
          to open the dossier. Study period stays with you on Map, Events, and Cases.
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
          {
            label: "Starts",
            value: String(kpis.starts ?? 0),
            hint: "Anonymous sessions that began a case",
            onClick: () => navigate("/events"),
          },
          {
            label: "Completions",
            value: String(kpis.completions ?? 0),
            hint: "Last numbered step reached",
            onClick: () => navigate("/events"),
          },
          { label: "Completion rate", value: formatPercent(completionRate), hint: "Completions ÷ starts" },
          {
            label: "Exits",
            value: String(kpis.exits ?? 0),
            hint: "Left before completion",
            onClick: () => navigate("/events"),
          },
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
          {
            label: "Active cases",
            value: String(kpis.active_cases ?? 0),
            hint: "With ≥1 start in range",
            onClick: () => navigate("/cases"),
          },
        ]}
      />

      <p className="mt-2 mb-6 text-[11px] text-ink-soft">
        Session outcomes in this extract: {completedSessions} completed, {exitedSessions} exited, {inProgress} in
        progress. Named user and hospital are not collected. Click any case name or table row to drill in.
      </p>

      <div className="mb-4">
        <DashboardCharts metrics={metrics} funnel={funnel} durations={durations} weekdays={weekdays} hours={hours} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CountTable
          title="By case"
          caption="Click a case for its dossier. Completion rate is completions ÷ starts."
          rows={byCase}
          nLabel="Starts"
          percentLabel="Completion rate"
          onRowClick={(row) => {
            const match = (metrics.by_case ?? []).find((c) => c.display_name === row.label);
            if (match) navigate(`/cases/${encodeURIComponent(match.case_key)}`);
          }}
          rowHint="Open case dossier"
          empty="No case activity in this range."
        />
        <CountTable title="Outcomes" rows={outcomeMix(sessions)} empty="No sessions in this range." />
        <CountTable
          title="By locality"
          caption="Click a place to open the map. City comes from IP geolocation; the IP is not stored."
          rows={byGeo}
          onRowClick={(row) => {
            setFilters({ ...filters, search: row.label.split(",")[0] ?? row.label });
            navigate("/map");
          }}
          rowHint="Open on the map"
          empty="No session locality in this range."
        />
        <CountTable
          title="By state / country"
          rows={byRegion}
          onRowClick={(row) => {
            setFilters({ ...filters, search: row.label.split(",")[0] ?? row.label });
            navigate("/map");
          }}
          rowHint="Open on the map"
          empty="No region data in this range."
        />
        <CountTable
          title="By site code"
          caption="Optional hospital or program code from the case URL."
          rows={bySite}
          empty="No site codes in this range."
        />
        <CountTable
          title="By access"
          rows={byAccess}
          onRowClick={(row) => {
            const key =
              row.label === "Wix embed" ? "wix_embedded" : row.label === "GitHub Pages" ? "github_direct" : "unknown";
            setFilters({ ...filters, deliveryContexts: [key] });
          }}
          rowHint="Filter to this access path"
          empty="No access mix in this range."
        />
        <CountTable
          title="By device"
          rows={byDevice}
          onRowClick={(row) =>
            setFilters({
              ...filters,
              deviceTypes: [row.label as "desktop" | "tablet" | "mobile" | "unknown"],
            })
          }
          rowHint="Filter to this device"
          empty="No device mix in this range."
        />
        <CountTable
          title="Last step reached"
          caption="Where sessions currently sit. Click to search."
          rows={tally(sessions, (s) => s.last_step, "Unknown")}
          onRowClick={(row) => setFilters({ ...filters, search: row.label })}
          rowHint="Search sessions at this step"
          empty="No step checkpoints in this range."
        />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-ink">Sessions</h2>
            <p className="mt-1 text-sm text-ink-soft">
              One row per anonymous session. Open a session for every action, or a case name for the case dossier.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="border border-line bg-card px-3 py-1.5 text-sm"
              onClick={() =>
                downloadCsv(
                  `simbox-events-${rangeStamp(bounds.from, bounds.to)}.csv`,
                  sessions.flatMap((s) => s.events.map((e) => eventCsvRow(e))),
                )
              }
            >
              Export event log
            </button>
            <button
              type="button"
              className="bg-ink px-3 py-1.5 text-sm text-card"
              onClick={() =>
                downloadCsv(`simbox-sessions-${rangeStamp(bounds.from, bounds.to)}.csv`, sessions.map(sessionCsvRow))
              }
            >
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
          onRowClick={(r) => navigate(`/sessions/${encodeURIComponent(r.session_id)}`)}
          emptyTitle="No sessions in this range"
          emptyBody="Adjust the study period or filters, or confirm tracking is reaching the intake function."
        />
      </section>
    </div>
  );
}
