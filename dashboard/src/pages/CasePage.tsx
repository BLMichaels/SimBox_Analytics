import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { OutcomeBadge } from "../components/CaseLink";
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
import type { CaseRecord, DashboardMetrics } from "../lib/types";

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

export function CasePage() {
  const { caseKey: rawKey } = useParams();
  const caseKey = rawKey ? decodeURIComponent(rawKey) : "";
  const navigate = useNavigate();
  const { filters, setFilters, bounds, cases } = useStudyFilters();
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics());
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [record, setRecord] = useState<CaseRecord | null>(null);

  useEffect(() => {
    const hit = cases.find((c) => c.case_key === caseKey) ?? null;
    setRecord(hit);
  }, [caseKey, cases]);

  const load = useCallback(async () => {
    const hit = cases.find((c) => c.case_key === caseKey);
    if (!hit) {
      setSessions([]);
      setMetrics(emptyMetrics());
      return;
    }
    setError(null);
    const { data, error: err } = await supabase.rpc("admin_filtered_metrics", {
      p_from: bounds.from.toISOString(),
      p_to: new Date(bounds.to.getTime() + 1).toISOString(),
      p_case_ids: [hit.id],
      p_event_types: null,
      p_delivery_contexts: filters.deliveryContexts.length ? filters.deliveryContexts : null,
      p_device_types: filters.deviceTypes.length ? filters.deviceTypes : null,
      p_include_nonproduction: filters.includeNonProduction,
    });
    if (err || !data) setMetrics(emptyMetrics());
    else setMetrics(data as DashboardMetrics);

    const fetched = await fetchCaseEvents({
      from: bounds.from,
      to: bounds.to,
      caseIds: [hit.id],
      deliveryContexts: filters.deliveryContexts,
      deviceTypes: filters.deviceTypes,
    });
    if (fetched.error) {
      setError(fetched.error);
      setSessions([]);
      return;
    }
    setSessions(
      summarizeSessions(
        applyClientFilters(fetched.rows, {
          includeNonProduction: filters.includeNonProduction,
          search: filters.search,
        }),
      ),
    );
  }, [bounds.from, bounds.to, caseKey, cases, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveReload(load);

  const kpis = metrics.kpis;
  const completionRate = !kpis.starts ? 0 : Number(kpis.completions) / Number(kpis.starts);
  const funnel = useMemo(() => funnelFromSessions(sessions), [sessions]);
  const durations = useMemo(() => durationBuckets(sessions), [sessions]);
  const weekdays = useMemo(() => weekdayMix(sessions), [sessions]);
  const hours = useMemo(() => hourMix(sessions), [sessions]);
  const lastStep = useMemo(() => tally(sessions, (s) => s.last_step, "Unknown"), [sessions]);

  const columns: Column<SessionSummary>[] = [
    {
      key: "session",
      header: "Session",
      sortValue: (r) => r.session_id,
      render: (r) => <SessionLink sessionId={r.session_id} />,
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
    { key: "site", header: "Site", sortValue: (r) => r.site, render: (r) => r.site },
    { key: "access", header: "Access", sortValue: (r) => r.access, render: (r) => r.access },
    { key: "device", header: "Device", sortValue: (r) => r.device, render: (r) => r.device },
  ];

  if (!caseKey) {
    return (
      <div>
        <h1 className="font-serif text-3xl text-ink">Case</h1>
        <p className="mt-2 text-sm text-ink-soft">No case key in the URL.</p>
      </div>
    );
  }

  if (!cases.length) {
    return <p className="text-sm text-ink-soft">Loading case…</p>;
  }

  if (!record) {
    return (
      <div>
        <Link to="/cases" className="text-sm text-teal-deep underline-offset-2 hover:underline">
          ← All cases
        </Link>
        <h1 className="font-serif mt-4 text-3xl text-ink">Unknown case</h1>
        <p className="mt-2 text-sm text-ink-soft">
          No registered case matches <code className="font-mono">{caseKey}</code>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link to="/cases" className="text-sm text-teal-deep underline-offset-2 hover:underline">
        ← All cases
      </Link>
      <header className="mt-4 mb-6 border-b border-ink pb-5">
        <p className="text-[11px] font-medium tracking-[0.18em] text-teal uppercase">Case dossier</p>
        <h1 className="font-serif mt-1 text-3xl text-ink">{record?.display_name ?? caseKey}</h1>
        <p className="mt-2 font-mono text-xs text-ink-soft">{caseKey}</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
          Anonymous usage for {formatRange(bounds.from, bounds.to)}. Click a locality to open the map, a
          session to open the action log, or an access/device row to filter this view.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="border border-line bg-card px-3 py-1.5 text-sm"
            onClick={() => {
              if (record) setFilters({ ...filters, caseIds: [record.id] });
              navigate("/map");
            }}
          >
            Open on map
          </button>
          <button
            type="button"
            className="border border-line bg-card px-3 py-1.5 text-sm"
            onClick={() => {
              if (record) setFilters({ ...filters, caseIds: [record.id] });
              navigate("/events");
            }}
          >
            Open event log
          </button>
          <button
            type="button"
            className="bg-ink px-3 py-1.5 text-sm text-card"
            onClick={() =>
              downloadCsv(`simbox-${caseKey}-${rangeStamp(bounds.from, bounds.to)}.csv`, sessions.map(sessionCsvRow))
            }
          >
            Export sessions
          </button>
        </div>
      </header>

      <FilterBar
        cases={cases}
        filters={filters}
        onChange={setFilters}
        compact
        showSearch
        hideCases
      />
      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <StudyLedger
        items={[
          { label: "Starts", value: String(kpis.starts ?? 0), hint: "Anonymous sessions that began this case" },
          { label: "Completions", value: String(kpis.completions ?? 0), hint: "Reached the last numbered step" },
          { label: "Completion rate", value: formatPercent(completionRate), hint: "Completions ÷ starts" },
          { label: "Exits", value: String(kpis.exits ?? 0), hint: "Left before completion" },
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
            label: "In progress",
            value: String(sessions.filter((s) => s.outcome === "in_progress").length),
            hint: "Started, no complete or exit yet",
          },
          {
            label: "Status",
            value: record?.active ? "Active" : "Inactive",
            hint: record?.active ? "Accepting new events" : "New events are rejected",
          },
        ]}
      />

      <div className="mt-4">
        <DashboardCharts metrics={metrics} funnel={funnel} durations={durations} weekdays={weekdays} hours={hours} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <CountTable
          title="Where they leave"
          caption="Last recorded step. Click a step to search the session table."
          rows={lastStep}
          onRowClick={(row) => setFilters({ ...filters, search: row.label })}
          rowHint="Filter sessions by this last step"
          empty="No step data in this range."
        />
        <CountTable title="Outcomes" rows={outcomeMix(sessions)} empty="No sessions in this range." />
        <CountTable
          title="Locality"
          caption="Click a place to open it on the map."
          rows={tally(sessions, (s) => s.location)}
          onRowClick={(row) => {
            setFilters({ ...filters, search: row.label.split(",")[0] ?? row.label, caseIds: record ? [record.id] : filters.caseIds });
            navigate("/map");
          }}
          rowHint="Open this locality on the map"
          empty="No locality in this range."
        />
        <CountTable
          title="Access"
          rows={tally(sessions, (s) => s.access, "Unknown")}
          onRowClick={(row) => {
            const key =
              row.label === "Wix embed" ? "wix_embedded" : row.label === "GitHub Pages" ? "github_direct" : "unknown";
            setFilters({ ...filters, deliveryContexts: [key] });
          }}
          rowHint="Filter to this access path"
          empty="No access mix in this range."
        />
        <CountTable
          title="Device"
          rows={tally(sessions, (s) => s.device, "unknown")}
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
          title="Site codes"
          caption="Optional ?simbox_site= value. Not a hospital name."
          rows={tally(sessions, (s) => (s.site === "Not provided" ? "" : s.site), "Not provided")}
          empty="No site codes in this range."
        />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-ink">Sessions</h2>
            <p className="mt-1 text-sm text-ink-soft">One anonymous run of this case. Open a row for the full action progression.</p>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={sessions}
          rowKey={(r) => r.session_id}
          pageSize={20}
          compact
          onRowClick={(r) => navigate(`/sessions/${encodeURIComponent(r.session_id)}`)}
          emptyTitle="No sessions for this case in range"
          emptyBody="Widen the study period, or confirm this case key is in the Storyline tracking snippet."
        />
      </section>
      <p className="mt-6 text-sm text-ink-soft">
        Register or edit tracking on the{" "}
        <Link to="/cases" className="text-teal-deep underline-offset-2 hover:underline">
          Cases
        </Link>{" "}
        catalog.
      </p>
    </div>
  );
}
