import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CaseLink, OutcomeBadge } from "../components/CaseLink";
import { DataTable, type Column } from "../components/DataTable";
import { downloadCsv } from "../lib/csv";
import { formatDuration, formatLocalPrecise } from "../lib/dates";
import { fetchCaseEvents } from "../lib/fetchEvents";
import {
  accessLabel,
  cardiacMetricsFromEvents,
  dash,
  eventCsvRow,
  eventLabel,
  localityOf,
  metaString,
  outcomeLabel,
  sessionCsvRow,
  sessionTimeline,
  stepLine,
  summarizeSessions,
} from "../lib/reporting";
import type { CaseEventRecord } from "../lib/types";

export function SessionPage() {
  const { sessionId: rawId } = useParams();
  const navigate = useNavigate();
  const sessionId = rawId ? decodeURIComponent(rawId) : "";
  const [rows, setRows] = useState<CaseEventRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    const { rows: next, error: err } = await fetchCaseEvents({
      from: new Date(0),
      to: new Date(),
      sessionId,
    });
    if (err) {
      setError(err);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(next);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeSessions(rows)[0] ?? null, [rows]);
  const timeline = useMemo(() => sessionTimeline(rows), [rows]);
  const cardiac = useMemo(() => cardiacMetricsFromEvents(rows), [rows]);
  const loc = useMemo(() => {
    const source = [...rows].reverse().find((r) => localityOf(r).city || localityOf(r).country) ?? rows[rows.length - 1];
    return source ? localityOf(source) : null;
  }, [rows]);

  const columns: Column<CaseEventRecord>[] = [
    {
      key: "time",
      header: "Local time",
      sortValue: (r) => r.occurred_at,
      render: (r) => formatLocalPrecise(r.occurred_at),
    },
    {
      key: "utc",
      header: "UTC",
      sortValue: (r) => r.occurred_at,
      render: (r) => <span className="font-mono text-[11px]">{r.occurred_at}</span>,
    },
    { key: "event", header: "Action", sortValue: (r) => r.event_type, render: (r) => eventLabel(r.event_type, r) },
    { key: "step", header: "Step", sortValue: (r) => stepLine(r), render: (r) => stepLine(r) },
    {
      key: "elapsed",
      header: "Elapsed",
      sortValue: (r) => r.elapsed_seconds ?? -1,
      render: (r) => formatDuration(r.elapsed_seconds),
    },
    { key: "city", header: "City", sortValue: (r) => metaString(r, "city"), render: (r) => dash(metaString(r, "city")) },
    { key: "region", header: "State / region", sortValue: (r) => metaString(r, "region"), render: (r) => dash(metaString(r, "region")) },
    { key: "postal", header: "Postal", sortValue: (r) => metaString(r, "postal"), render: (r) => dash(metaString(r, "postal")) },
    { key: "country", header: "Country", sortValue: (r) => metaString(r, "country"), render: (r) => dash(metaString(r, "country")) },
  ];

  function exportSession() {
    if (!summary) return;
    downloadCsv(`simbox-session-${sessionId.slice(0, 8)}.csv`, [sessionCsvRow(summary)]);
  }

  function exportEvents() {
    downloadCsv(
      `simbox-session-${sessionId.slice(0, 8)}-events.csv`,
      timeline.map((step) =>
        eventCsvRow(step.event, {
          sequence: step.index + 1,
          seconds_since_previous: step.deltaSec,
        }),
      ),
    );
  }

  if (!sessionId) {
    return (
      <div>
        <h1 className="font-serif text-3xl text-ink">Session</h1>
        <p className="mt-2 text-sm text-ink-soft">No session ID in the URL.</p>
      </div>
    );
  }

  return (
    <div className="session-dossier mx-auto max-w-6xl">
      <Link
        to="/dashboard"
        className="text-sm text-teal-deep underline-offset-2 hover:underline"
      >
        ← Back to study overview
      </Link>

      <header className="mt-4 border-b border-ink pb-5">
        <p className="text-[11px] font-medium tracking-[0.18em] text-teal uppercase">Session dossier</p>
        <h1 className="font-serif mt-1 text-3xl text-ink">Anonymous session</h1>
        <p className="mt-2 font-mono text-xs break-all text-ink-soft">{sessionId}</p>
        {summary ? (
          <p className="mt-3 max-w-2xl text-sm text-ink-soft">
            <CaseLink caseKey={summary.case_key}>{summary.case_name}</CaseLink>
            . <OutcomeBadge outcome={summary.outcome} /> · {summary.event_count} recorded
            action{summary.event_count === 1 ? "" : "s"} from {formatLocalPrecise(summary.started_at)} to{" "}
            {formatLocalPrecise(summary.ended_at)}.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {summary?.case_key ? (
            <button
              type="button"
              className="border border-line bg-card px-3 py-1.5 text-sm"
              onClick={() => navigate(`/cases/${encodeURIComponent(summary.case_key)}`)}
            >
              Open case dossier
            </button>
          ) : null}
          <button type="button" className="border border-line bg-card px-3 py-1.5 text-sm" onClick={exportSession} disabled={!summary}>
            Export session row
          </button>
          <button type="button" className="bg-ink px-3 py-1.5 text-sm text-card" onClick={exportEvents} disabled={rows.length === 0}>
            Export action log
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-ink-soft">Loading session…</p>
      ) : rows.length === 0 ? (
        <div className="mt-6 border border-dashed border-line bg-card px-6 py-12 text-center">
          <p className="font-serif text-xl text-ink">No events for this session</p>
          <p className="mt-2 text-sm text-ink-soft">The ID may be wrong, or the events were deleted.</p>
        </div>
      ) : (
        <>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="border border-line bg-card p-4">
              <h2 className="text-[11px] font-medium tracking-[0.14em] text-ink-soft uppercase">Case and outcome</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact label="Case" value={summary?.case_name ?? "—"} />
                <Fact label="Case key" value={summary?.case_key || "—"} mono />
                <Fact label="Outcome" value={summary ? outcomeLabel(summary.outcome) : "—"} />
                <Fact label="Duration" value={formatDuration(summary?.elapsed_seconds)} />
                <Fact label="Actions" value={String(summary?.event_count ?? rows.length)} />
                <Fact label="Steps reached" value={String(summary?.checkpoint_count ?? 0)} />
                <Fact label="Last step" value={summary?.last_step ?? "—"} />
                <Fact label="Access" value={summary?.access ?? accessLabel(rows[0]?.delivery_context)} />
                <Fact label="Device" value={summary?.device ?? rows[0]?.device_type ?? "—"} />
                <Fact label="Environment" value={summary?.environment ?? "production"} />
              </dl>
            </article>

            <article className="border border-line bg-card p-4">
              <h2 className="text-[11px] font-medium tracking-[0.14em] text-ink-soft uppercase">Locality</h2>
              <p className="mt-2 text-[12px] leading-5 text-ink-soft">
                Network locality is resolved from the request at ingest. Named user and hospital are not in the Storyline player unless a site code is added to the case URL.
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact label="City" value={dash(loc?.city ?? "")} />
                <Fact label="State / region" value={dash(loc?.region ?? "")} />
                <Fact label="Postal / ZIP" value={dash(loc?.postal ?? "")} />
                <Fact label="Country" value={dash(loc?.country ?? "")} />
                <Fact label="Timezone" value={dash(loc?.timezone ?? "")} />
                <Fact label="Site code" value={summary?.site ?? "Not provided"} />
                <Fact label="Hospital name" value="Not collected" />
                <Fact label="User identity" value="Not collected" />
              </dl>
            </article>
          </section>

          <section className="mt-8">
            <h2 className="font-serif text-2xl text-ink">Action progression</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Every recorded action in this session, in order. Deltas are seconds since the previous action.
            </p>
            {cardiac.actions.length || cardiac.compression ? (
              <div className="mb-6 mt-5 grid gap-4 lg:grid-cols-2">
                <article className="border border-line bg-card p-4">
                  <h3 className="text-[11px] font-medium tracking-[0.14em] text-ink-soft uppercase">
                    Code timeline (sim clock)
                  </h3>
                  {cardiac.actions.length ? (
                    <ol className="mt-3 space-y-2 text-sm">
                      {cardiac.actions.map((a, i) => (
                        <li key={`${a.action}-${a.clock}-${i}`} className="flex flex-wrap gap-x-3 gap-y-1">
                          <span className="font-mono text-ink">{a.clock || "—"}</span>
                          <span className="text-ink">{a.label}</span>
                          {a.stage != null && a.stage > 0 ? (
                            <span className="text-ink-soft">Stage {a.stage}</span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-3 text-sm text-ink-soft">No timed clinical actions recorded yet.</p>
                  )}
                </article>
                <article className="border border-line bg-card p-4">
                  <h3 className="text-[11px] font-medium tracking-[0.14em] text-ink-soft uppercase">
                    Compression interruptions
                  </h3>
                  {cardiac.compression ? (
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <Fact label="Interruptions" value={String(cardiac.compression.pauseCount)} />
                      <Fact label="Total time off" value={formatDuration(cardiac.compression.pauseTotalSec)} />
                      <Fact label="Average pause" value={formatDuration(cardiac.compression.pauseAvgSec)} />
                    </dl>
                  ) : (
                    <p className="mt-3 text-sm text-ink-soft">No compression summary in this session.</p>
                  )}
                </article>
              </div>
            ) : null}
            <ol className="session-rail mt-5 space-y-0">
              {timeline.map((step) => (
                <li key={step.event.id} className="relative pl-10">
                  {step.index > 0 ? (
                    <p className="mb-1 pl-1 font-mono text-[11px] text-copper">+{formatDuration(step.deltaSec)}</p>
                  ) : null}
                  <div className="session-node absolute top-1.5 left-0 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[11px] font-medium text-card">
                    {step.index + 1}
                  </div>
                  <article className="mb-4 border border-line bg-card px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-medium text-ink">{eventLabel(step.event.event_type, step.event)}</h3>
                      <p className="font-mono text-[11px] text-ink-soft">{formatLocalPrecise(step.event.occurred_at)}</p>
                    </div>
                    <p className="mt-1 text-sm text-ink">{stepLine(step.event)}</p>
                    <p className="mt-1 text-[12px] text-ink-soft">
                      Elapsed {formatDuration(step.event.elapsed_seconds)}
                      {metaString(step.event, "slideId") ? ` · slide ${metaString(step.event, "slideId")}` : ""}
                    </p>
                  </article>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-8">
            <h2 className="font-serif mb-3 text-2xl text-ink">Event table</h2>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              pageSize={50}
              compact
              defaultDir="asc"
              emptyTitle="No events"
              emptyBody=""
            />
          </section>
        </>
      )}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className={["mt-0.5", mono ? "font-mono text-xs break-all" : ""].join(" ")}>{value}</dd>
    </div>
  );
}
