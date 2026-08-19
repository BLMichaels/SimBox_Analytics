import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "../components/FilterBar";
import { DataTable, type Column } from "../components/DataTable";
import { downloadCsv, rangeStamp } from "../lib/csv";
import { formatDuration, formatLocal, rangeForPreset, shortSession } from "../lib/dates";
import { supabase } from "../lib/supabase";
import type { CaseEventRecord, CaseRecord, Filters } from "../lib/types";

const PAGE_CHUNK = 1000;

export function EventsPage() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [rows, setRows] = useState<CaseEventRecord[]>([]);
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
      includeNonProduction: import.meta.env.DEV,
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      const collected: CaseEventRecord[] = [];
      for (let from = 0; from < 5000; from += PAGE_CHUNK) {
        let q = supabase
          .from("case_events")
          .select("*, cases(case_key, display_name, active)")
          .gte("occurred_at", bounds.from.toISOString())
          .lt("occurred_at", new Date(bounds.to.getTime() + 1).toISOString())
          .order("occurred_at", { ascending: false })
          .range(from, from + PAGE_CHUNK - 1);
        if (filters.caseIds.length) q = q.in("case_id", filters.caseIds);
        if (filters.eventTypes.length) q = q.in("event_type", filters.eventTypes);
        if (filters.deliveryContexts.length) q = q.in("delivery_context", filters.deliveryContexts);
        if (filters.deviceTypes.length) q = q.in("device_type", filters.deviceTypes);
        const { data, error: err } = await q;
        if (err) {
          if (!cancelled) setError("Unable to load events.");
          return;
        }
        const batch = (data ?? []) as CaseEventRecord[];
        collected.push(...batch);
        if (batch.length < PAGE_CHUNK) break;
      }
      if (cancelled) return;
      let next = collected;
      if (!filters.includeNonProduction) {
        next = next.filter((r) => (r.metadata?.environment ?? "production") === "production");
      }
      if (filters.search.trim()) {
        const s = filters.search.trim().toLowerCase();
        next = next.filter((r) => {
          const name = r.cases?.display_name ?? "";
          const key = r.cases?.case_key ?? "";
          return (
            name.toLowerCase().includes(s) ||
            key.toLowerCase().includes(s) ||
            r.session_id.toLowerCase().includes(s)
          );
        });
      }
      setRows(next);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [bounds.from, bounds.to, filters]);

  const columns: Column<CaseEventRecord>[] = [
    { key: "local", header: "Local date/time", sortValue: (r) => r.occurred_at, render: (r) => formatLocal(r.occurred_at) },
    { key: "utc", header: "UTC", sortValue: (r) => r.occurred_at, render: (r) => r.occurred_at },
    { key: "case", header: "Case", sortValue: (r) => r.cases?.display_name ?? "", render: (r) => r.cases?.display_name ?? "—" },
    { key: "key", header: "Case key", sortValue: (r) => r.cases?.case_key ?? "", render: (r) => <span className="font-mono text-xs">{r.cases?.case_key}</span> },
    { key: "event", header: "Event", sortValue: (r) => r.event_type, render: (r) => r.event_type.replace("case_", "") },
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
    { key: "elapsed", header: "Elapsed", sortValue: (r) => r.elapsed_seconds ?? -1, render: (r) => formatDuration(r.elapsed_seconds) },
    {
      key: "access",
      header: "Access",
      sortValue: (r) => r.delivery_context ?? "",
      render: (r) =>
        r.delivery_context === "wix_embedded"
          ? "Wix embed"
          : r.delivery_context === "github_direct"
            ? "GitHub direct"
            : r.delivery_context ?? "—",
    },
    { key: "device", header: "Device", sortValue: (r) => r.device_type ?? "", render: (r) => r.device_type ?? "—" },
    { key: "env", header: "Env", sortValue: (r) => String(r.metadata?.environment ?? "production"), render: (r) => String(r.metadata?.environment ?? "production") },
  ];

  function exportCsv() {
    downloadCsv(
      `simbox-events-${rangeStamp(bounds.from, bounds.to)}.csv`,
      rows.map((r) => ({
        local_timestamp: formatLocal(r.occurred_at),
        utc_timestamp: r.occurred_at,
        case_name: r.cases?.display_name ?? "",
        case_key: r.cases?.case_key ?? "",
        event: r.event_type,
        session_id: r.session_id,
        event_key: r.event_key,
        elapsed_seconds: r.elapsed_seconds,
        access_context: r.delivery_context,
        device: r.device_type,
        environment: String(r.metadata?.environment ?? "production"),
      })),
    );
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink">Event log</h1>
          <p className="mt-1 text-sm text-ink-soft">Anonymous session identifiers only. No names, emails, or free-text responses.</p>
        </div>
        <button type="button" className="border border-line bg-card px-3 py-2 text-sm" onClick={exportCsv}>
          Export CSV
        </button>
      </header>
      <FilterBar cases={cases} filters={filters} onChange={setFilters} showEventFilter showSearch />
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
        emptyTitle="No events match these filters"
        emptyBody="Try a wider date range, clear search, or include seed/test events if you are reviewing development data."
      />
    </div>
  );
}
