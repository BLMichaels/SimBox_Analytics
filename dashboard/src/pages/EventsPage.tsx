import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { SessionLink } from "../components/SessionLink";
import { downloadCsv, rangeStamp } from "../lib/csv";
import { formatDuration, formatLocal, rangeForPreset } from "../lib/dates";
import { applyClientFilters, fetchCaseEvents } from "../lib/fetchEvents";
import { dash, eventCsvRow, eventLabel, metaString, stepLine } from "../lib/reporting";
import { supabase } from "../lib/supabase";
import { useLiveReload } from "../lib/useLiveReload";
import type { CaseEventRecord, CaseRecord, Filters } from "../lib/types";

export function EventsPage() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [rows, setRows] = useState<CaseEventRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | { ids: string[]; label: string }>(null);
  const [busy, setBusy] = useState(false);
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
      .then(({ data }) => setCases((data ?? []) as CaseRecord[]));
  }, []);

  const load = useCallback(async () => {
    setError(null);
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
      return;
    }
    const next = applyClientFilters(fetched.rows, {
      includeNonProduction: filters.includeNonProduction,
      search: filters.search,
    });
    setRows(next);
    setSelectedIds((prev) => {
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

  useLiveReload(load);

  const columns: Column<CaseEventRecord>[] = [
    { key: "local", header: "Local date/time", sortValue: (r) => r.occurred_at, render: (r) => formatLocal(r.occurred_at) },
    {
      key: "case",
      header: "Case",
      sortValue: (r) => r.cases?.display_name ?? "",
      render: (r) => r.cases?.display_name ?? "—",
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
    { key: "city", header: "City", sortValue: (r) => metaString(r, "city"), render: (r) => dash(metaString(r, "city")) },
    { key: "region", header: "State / region", sortValue: (r) => metaString(r, "region"), render: (r) => dash(metaString(r, "region")) },
    { key: "postal", header: "Postal", sortValue: (r) => metaString(r, "postal"), render: (r) => dash(metaString(r, "postal")) },
    { key: "country", header: "Country", sortValue: (r) => metaString(r, "country"), render: (r) => dash(metaString(r, "country")) },
    { key: "site", header: "Site", sortValue: (r) => metaString(r, "siteKey"), render: (r) => dash(metaString(r, "siteKey")) },
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

  const testIds = rows
    .filter((r) => {
      const env = String(r.metadata?.environment ?? "production");
      return env === "test" || env === "seed";
    })
    .map((r) => r.id);

  async function deleteIds(ids: string[]) {
    const { error: delError } = await supabase.from("case_events").delete().in("id", ids);
    if (!delError) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!token || !url || !anon) {
      throw new Error("delete");
    }
    const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/admin-delete-simbox-events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error("delete");
  }

  async function confirmDelete() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      await deleteIds(confirm.ids);
      setSelectedIds(new Set());
      setConfirm(null);
      await load();
    } catch {
      setError("Unable to delete the selected events.");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(`simbox-events-${rangeStamp(bounds.from, bounds.to)}.csv`, rows.map((r) => eventCsvRow(r)));
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink">Event log</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Raw anonymous actions. Click a session ID to open the dossier.
            {rows.length ? ` ${rows.length} event${rows.length === 1 ? "" : "s"} in this range.` : ""}
          </p>
        </div>
        <button type="button" className="border border-line bg-card px-3 py-2 text-sm" onClick={exportCsv}>
          Export CSV
        </button>
      </header>
      <FilterBar cases={cases} filters={filters} onChange={setFilters} showEventFilter showSearch />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="border border-line bg-card px-3 py-1.5 text-sm disabled:opacity-40"
          disabled={rows.length === 0}
          onClick={() => setSelectedIds(new Set(rows.map((r) => r.id)))}
        >
          Select all in list
        </button>
        <button
          type="button"
          className="border border-line bg-card px-3 py-1.5 text-sm disabled:opacity-40"
          disabled={selectedIds.size === 0}
          onClick={() => setSelectedIds(new Set())}
        >
          Clear selection
        </button>
        <button
          type="button"
          className="border border-danger bg-card px-3 py-1.5 text-sm text-danger disabled:opacity-40"
          disabled={selectedIds.size === 0 || busy}
          onClick={() =>
            setConfirm({
              ids: [...selectedIds],
              label: `${selectedIds.size} selected event${selectedIds.size === 1 ? "" : "s"}`,
            })
          }
        >
          Delete selected{selectedIds.size ? ` (${selectedIds.size})` : ""}
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
      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pageSize={25}
        compact
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        emptyTitle="No events match these filters"
        emptyBody="Try a wider date range, clear search, or include seed/test events if you are reviewing development data."
      />
      {confirm ? (
        <ConfirmDialog
          title="Delete events?"
          body={`This permanently removes ${confirm.label}. Completions and starts in reports will update after deletion.`}
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
