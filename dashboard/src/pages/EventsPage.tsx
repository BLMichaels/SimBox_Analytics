import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaseLink, OutcomeBadge } from "../components/CaseLink";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { SessionLink } from "../components/SessionLink";
import { TruncationNotice } from "../components/TruncationNotice";
import { callAdminFunction } from "../lib/adminApi";
import { logAudit } from "../lib/auditLog";
import { useAuth } from "../lib/auth";
import { downloadCsv, rangeStamp } from "../lib/csv";
import { formatDuration, formatLocal } from "../lib/dates";
import { applyClientFilters, fetchCaseEvents } from "../lib/fetchEvents";
import { useStudyFilters } from "../lib/FilterProvider";
import {
  dash as dashText,
  eventCsvRow,
  eventLabel,
  eventStamp,
  filterEventsBySessions,
  filterSessionsByMinDuration,
  metaString,
  progressionLine,
  sessionWideCsvRow,
  stepLine,
  stepStamp,
  summarizeSessions,
  unionStepLabels,
  type SessionSummary,
} from "../lib/reporting";
import { useLiveReload } from "../lib/useLiveReload";
import type { CaseEventRecord } from "../lib/types";

const DELETE_CHUNK = 400;
type LogView = "events" | "sessions";

export function EventsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { filters, setFilters, bounds, cases } = useStudyFilters();
  const [rows, setRows] = useState<CaseEventRecord[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [fetchedCount, setFetchedCount] = useState(0);
  const [eventTotal, setEventTotal] = useState<number | null>(null);
  const [view, setView] = useState<LogView>("events");
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | { ids: string[]; label: string }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadGen = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    setError(null);
    const fetched = await fetchCaseEvents({
      from: bounds.from,
      to: bounds.to,
      caseIds: filters.caseIds,
      deliveryContexts: filters.deliveryContexts,
      deviceTypes: filters.deviceTypes,
    });
    if (gen !== loadGen.current) return;
    if (fetched.error) {
      setError(fetched.error);
      return;
    }
    const next = applyClientFilters(fetched.rows, {
      includeNonProduction: filters.includeNonProduction,
      search: filters.search,
    });
    setTruncated(fetched.truncated);
    setFetchedCount(fetched.fetched);
    setEventTotal(fetched.total);
    setRows(next);
    setSelectedEventIds((prev) => {
      const keep = new Set<string>();
      const ids = new Set(next.map((r) => r.id));
      for (const id of prev) {
        if (ids.has(id)) keep.add(id);
      }
      return keep;
    });
  }, [bounds.from, bounds.to, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveReload(load, !busy);

  const allSessions = useMemo(() => {
    const grouped = summarizeSessions(rows);
    if (!filters.eventTypes.length) return grouped;
    return grouped.filter((s) => s.events.some((e) => filters.eventTypes.includes(e.event_type)));
  }, [filters.eventTypes, rows]);

  const sessions = useMemo(
    () => filterSessionsByMinDuration(allSessions, filters.minSessionSeconds),
    [allSessions, filters.minSessionSeconds],
  );

  const eventRows = useMemo(() => {
    let next = !filters.eventTypes.length ? rows : rows.filter((r) => filters.eventTypes.includes(r.event_type));
    if (filters.minSessionSeconds > 0) next = filterEventsBySessions(next, sessions);
    return next;
  }, [filters.eventTypes, filters.minSessionSeconds, rows, sessions]);

  const stepLabels = useMemo(() => unionStepLabels(sessions), [sessions]);

  useEffect(() => {
    setSelectedSessionIds((prev) => {
      const keep = new Set<string>();
      const ids = new Set(sessions.map((s) => s.session_id));
      for (const id of prev) {
        if (ids.has(id)) keep.add(id);
      }
      return keep;
    });
  }, [sessions]);

  const eventColumns: Column<CaseEventRecord>[] = [
    { key: "local", header: "Local date/time", sortValue: (r) => r.occurred_at, render: (r) => formatLocal(r.occurred_at) },
    {
      key: "case",
      header: "Case",
      sortValue: (r) => r.cases?.display_name ?? "",
      render: (r) => <CaseLink caseKey={r.cases?.case_key ?? ""}>{r.cases?.display_name ?? "—"}</CaseLink>,
    },
    { key: "event", header: "Action", sortValue: (r) => r.event_type, render: (r) => eventLabel(r.event_type) },
    { key: "step", header: "Step", sortValue: (r) => stepLine(r), render: (r) => stepLine(r) },
    {
      key: "session",
      header: "Session",
      sortValue: (r) => r.session_id,
      render: (r) => <SessionLink sessionId={r.session_id} />,
    },
    {
      key: "elapsed",
      header: "Elapsed",
      sortValue: (r) => r.elapsed_seconds ?? -1,
      render: (r) => formatDuration(r.elapsed_seconds),
    },
    { key: "city", header: "City", sortValue: (r) => metaString(r, "city"), render: (r) => dashText(metaString(r, "city")) },
    { key: "region", header: "State / region", sortValue: (r) => metaString(r, "region"), render: (r) => dashText(metaString(r, "region")) },
    { key: "postal", header: "Postal", sortValue: (r) => metaString(r, "postal"), render: (r) => dashText(metaString(r, "postal")) },
    { key: "country", header: "Country", sortValue: (r) => metaString(r, "country"), render: (r) => dashText(metaString(r, "country")) },
    { key: "site", header: "Site", sortValue: (r) => metaString(r, "siteKey"), render: (r) => dashText(metaString(r, "siteKey")) },
    {
      key: "access",
      header: "Access",
      sortValue: (r) => r.delivery_context ?? "",
      render: (r) =>
        r.delivery_context === "wix_embedded"
          ? "Wix embed"
          : r.delivery_context === "github_direct"
            ? "GitHub Pages"
            : r.delivery_context ?? "—",
    },
    { key: "device", header: "Device", sortValue: (r) => r.device_type ?? "", render: (r) => r.device_type ?? "—" },
  ];

  const sessionColumns: Column<SessionSummary>[] = [
    {
      key: "session",
      header: "Session",
      sortValue: (r) => r.session_id,
      render: (r) => <SessionLink sessionId={r.session_id} />,
    },
    { key: "case", header: "Case", sortValue: (r) => r.case_name, render: (r) => <CaseLink caseKey={r.case_key}>{r.case_name}</CaseLink> },
    {
      key: "outcome",
      header: "Outcome",
      sortValue: (r) => r.outcome,
      render: (r) => <OutcomeBadge outcome={r.outcome} />,
    },
    {
      key: "duration",
      header: "Duration",
      sortValue: (r) => r.elapsed_seconds ?? -1,
      render: (r) => formatDuration(r.elapsed_seconds),
    },
    {
      key: "started",
      header: "Started",
      sortValue: (r) => eventStamp(r.events, "case_started") || r.started_at,
      render: (r) => dashText(eventStamp(r.events, "case_started")),
    },
    ...stepLabels.map((label) => ({
      key: `step:${label}`,
      header: label,
      sortValue: (r: SessionSummary) => stepStamp(r.events, label),
      render: (r: SessionSummary) => dashText(stepStamp(r.events, label)),
    })),
    {
      key: "completed",
      header: "Completed",
      sortValue: (r) => eventStamp(r.events, "case_completed"),
      render: (r) => dashText(eventStamp(r.events, "case_completed")),
    },
    {
      key: "exited",
      header: "Exited",
      sortValue: (r) => eventStamp(r.events, "case_exited"),
      render: (r) => dashText(eventStamp(r.events, "case_exited")),
    },
    {
      key: "progression",
      header: "Progression",
      sortValue: (r) => progressionLine(r),
      render: (r) => <span className="max-w-[28rem] whitespace-normal">{progressionLine(r) || "—"}</span>,
    },
    { key: "city", header: "City", sortValue: (r) => r.city, render: (r) => dashText(r.city) },
    { key: "region", header: "State / region", sortValue: (r) => r.region, render: (r) => dashText(r.region) },
    { key: "postal", header: "Postal", sortValue: (r) => r.postal, render: (r) => dashText(r.postal) },
    { key: "country", header: "Country", sortValue: (r) => r.country, render: (r) => dashText(r.country) },
    { key: "site", header: "Site", sortValue: (r) => r.site, render: (r) => r.site },
    { key: "access", header: "Access", sortValue: (r) => r.access, render: (r) => r.access },
    { key: "device", header: "Device", sortValue: (r) => r.device, render: (r) => r.device },
  ];

  const testIds = eventRows
    .filter((r) => {
      const env = String(r.metadata?.environment ?? "production");
      return env === "test" || env === "seed";
    })
    .map((r) => r.id);

  const selectedCount = view === "events" ? selectedEventIds.size : selectedSessionIds.size;

  async function deleteIds(ids: string[]) {
    let deleted = 0;
    for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
      const chunk = ids.slice(i, i + DELETE_CHUNK);
      const result = await callAdminFunction<{ deleted?: number }>("admin-delete-simbox-events", {
        ids: chunk,
      });
      deleted += Number(result.deleted ?? chunk.length);
    }
    return deleted;
  }

  async function confirmDelete() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const removing = new Set(confirm.ids);
    try {
      const deleted = await deleteIds(confirm.ids);
      setRows((prev) => prev.filter((row) => !removing.has(row.id)));
      setSelectedEventIds(new Set());
      setSelectedSessionIds(new Set());
      setConfirm(null);
      setNotice(
        `Removed ${deleted} event${deleted === 1 ? "" : "s"}. Those action keys will not be recorded again.`,
      );
      logAudit(user?.email ?? "", "delete_events", `${deleted} events (${confirm.label})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete the selected events.");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const stamp = rangeStamp(bounds.from, bounds.to);
    if (view === "sessions") {
      downloadCsv(
        `simbox-sessions-${stamp}.csv`,
        sessions.map((s) => sessionWideCsvRow(s, stepLabels)),
      );
      return;
    }
    downloadCsv(`simbox-events-${stamp}.csv`, eventRows.map((r) => eventCsvRow(r)));
  }

  function changeView(next: LogView) {
    setView(next);
    setSelectedEventIds(new Set());
    setSelectedSessionIds(new Set());
  }

  function selectAllVisible() {
    if (view === "sessions") {
      setSelectedSessionIds(new Set(sessions.map((s) => s.session_id)));
      return;
    }
    setSelectedEventIds(new Set(eventRows.map((r) => r.id)));
  }

  function requestDeleteSelected() {
    if (view === "sessions") {
      const chosen = sessions.filter((s) => selectedSessionIds.has(s.session_id));
      const ids = chosen.flatMap((s) => s.events.map((e) => e.id));
      setConfirm({
        ids,
        label: `${chosen.length} selected session${chosen.length === 1 ? "" : "s"} (${ids.length} events)`,
      });
      return;
    }
    setConfirm({
      ids: [...selectedEventIds],
      label: `${selectedEventIds.size} selected event${selectedEventIds.size === 1 ? "" : "s"}`,
    });
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink">Event log</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {view === "events"
              ? "Every recorded trigger as its own row."
              : "One row per anonymous session, with a column for each action that occurred."}{" "}
            Click a session ID for the full progression.
            {view === "events" && eventRows.length
              ? ` ${eventRows.length} event${eventRows.length === 1 ? "" : "s"} in this range.`
              : ""}
            {view === "sessions" && sessions.length
              ? ` ${sessions.length} session${sessions.length === 1 ? "" : "s"} in this range.`
              : ""}
          </p>
        </div>
        <button type="button" className="border border-line bg-card px-3 py-2 text-sm" onClick={exportCsv}>
          Export CSV
        </button>
      </header>

      <div role="tablist" aria-label="Log view" className="mb-4 inline-flex border border-line bg-card">
        <button
          type="button"
          role="tab"
          aria-selected={view === "events"}
          className={[
            "px-4 py-2 text-sm",
            view === "events" ? "bg-teal text-card" : "text-ink hover:bg-paper",
          ].join(" ")}
          onClick={() => changeView("events")}
        >
          Events
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "sessions"}
          className={[
            "px-4 py-2 text-sm",
            view === "sessions" ? "bg-teal text-card" : "text-ink hover:bg-paper",
          ].join(" ")}
          onClick={() => changeView("sessions")}
        >
          Sessions
        </button>
      </div>

      <FilterBar cases={cases} filters={filters} onChange={setFilters} showEventFilter showSearch />
      <TruncationNotice truncated={truncated} fetched={fetchedCount} total={eventTotal} />
      {filters.minSessionSeconds > 0 ? (
        <p className="mb-4 text-sm text-ink-soft">
          Minimum session length: {Math.round(filters.minSessionSeconds / 60)} minutes ({sessions.length} of{" "}
          {allSessions.length} sessions).
        </p>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="border border-line bg-card px-3 py-1.5 text-sm disabled:opacity-40"
          disabled={view === "events" ? eventRows.length === 0 : sessions.length === 0}
          onClick={selectAllVisible}
        >
          Select all in list
        </button>
        <button
          type="button"
          className="border border-line bg-card px-3 py-1.5 text-sm disabled:opacity-40"
          disabled={selectedCount === 0}
          onClick={() => {
            setSelectedEventIds(new Set());
            setSelectedSessionIds(new Set());
          }}
        >
          Clear selection
        </button>
        <button
          type="button"
          className="border border-danger bg-card px-3 py-1.5 text-sm text-danger disabled:opacity-40"
          disabled={selectedCount === 0 || busy}
          onClick={requestDeleteSelected}
        >
          Delete selected{selectedCount ? ` (${selectedCount})` : ""}
        </button>
        <button
          type="button"
          className="border border-line bg-card px-3 py-1.5 text-sm disabled:opacity-40"
          disabled={testIds.length === 0 || busy}
          onClick={() =>
            setConfirm({
              ids: testIds,
              label: `${testIds.length} test/seed event${testIds.length === 1 ? "" : "s"} in this list`,
            })
          }
        >
          Delete test/seed in list{testIds.length ? ` (${testIds.length})` : ""}
        </button>
      </div>
      {notice ? (
        <p role="status" className="mb-4 text-sm text-ok">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {view === "events" ? (
        <DataTable
          key="events"
          columns={eventColumns}
          rows={eventRows}
          rowKey={(r) => r.id}
          pageSize={25}
          compact
          selectedIds={selectedEventIds}
          onSelectedIdsChange={setSelectedEventIds}
          emptyTitle="No events match these filters"
          emptyBody="Try a wider date range, clear search, or include seed/test events if you are reviewing development data."
        />
      ) : (
        <DataTable
          key="sessions"
          columns={sessionColumns}
          rows={sessions}
          rowKey={(r) => r.session_id}
          pageSize={25}
          compact
          selectedIds={selectedSessionIds}
          onSelectedIdsChange={setSelectedSessionIds}
          onRowClick={(r) => navigate(`/sessions/${encodeURIComponent(r.session_id)}`)}
          emptyTitle="No sessions match these filters"
          emptyBody="Try a wider date range or clear search. Sessions group every action from the same anonymous tab."
        />
      )}
      {confirm ? (
        <ConfirmDialog
          title="Delete events?"
          body={`This permanently removes ${confirm.label} from the database. The same session cannot write those actions back.`}
          confirmLabel={busy ? "Deleting…" : "Delete"}
          onConfirm={() => {
            if (!busy) void confirmDelete();
          }}
          onCancel={() => {
            if (!busy) setConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}
