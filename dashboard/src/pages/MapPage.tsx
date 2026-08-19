import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { CountTable } from "../components/CountTable";
import { FilterBar } from "../components/FilterBar";
import { formatPercent, formatRange, rangeForPreset } from "../lib/dates";
import { applyClientFilters, fetchCaseEvents } from "../lib/fetchEvents";
import {
  bucketLocations,
  caseColors,
  placeSessions,
  sessionsForMetric,
  type LocationBucket,
  type MapGrain,
  type MapGroup,
  type MapLayer,
  type MapMetric,
} from "../lib/mapData";
import { summarizeSessions } from "../lib/reporting";
import { supabase } from "../lib/supabase";
import { useLiveReload } from "../lib/useLiveReload";
import type { CaseRecord, Filters } from "../lib/types";

const UsageMap = lazy(async () => {
  const mod = await import("../components/UsageMap");
  return { default: mod.UsageMap };
});

export function MapPage() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [buckets, setBuckets] = useState<LocationBucket[]>([]);
  const [unplaced, setUnplaced] = useState(0);
  const [metric, setMetric] = useState<MapMetric>("started");
  const [layer, setLayer] = useState<MapLayer>("bubbles");
  const [group, setGroup] = useState<MapGroup>("overall");
  const [grain, setGrain] = useState<MapGrain>("country");
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
    const fetched = await fetchCaseEvents({
      from: bounds.from,
      to: bounds.to,
      caseIds: filters.caseIds,
      deliveryContexts: filters.deliveryContexts,
      deviceTypes: filters.deviceTypes,
    });
    if (fetched.error) {
      setError(fetched.error);
      setBuckets([]);
      return;
    }
    const rows = applyClientFilters(fetched.rows, {
      includeNonProduction: filters.includeNonProduction,
      search: filters.search,
    });
    const sessions = sessionsForMetric(summarizeSessions(rows), metric);
    setPlacing(true);
    try {
      const placed = await placeSessions(sessions);
      setUnplaced(sessions.length - placed.length);
      setBuckets(bucketLocations(placed));
    } finally {
      setPlacing(false);
    }
  }, [bounds.from, bounds.to, filters, metric]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveReload(load);

  const starts = buckets.reduce((n, b) => n + b.starts, 0);
  const completions = buckets.reduce((n, b) => n + b.completions, 0);
  const grainLabel = grain === "country" ? "countries" : grain === "state" ? "states" : "counties";
  const caseLegend = useMemo(() => {
    const names = [...new Set(buckets.flatMap((b) => Object.values(b.cases).map((c) => c.name)))].sort();
    const colors = caseColors(names);
    return names.map((name) => ({ name, color: colors[name] ?? "#1f6a66" }));
  }, [buckets]);

  return (
    <div>
      <header className="mb-6 border-b border-ink pb-5">
        <p className="text-[11px] font-medium tracking-[0.18em] text-teal uppercase">Geography</p>
        <h1 className="font-serif mt-1 text-3xl text-ink">Usage map</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
          Anonymous sessions for {formatRange(bounds.from, bounds.to)}, placed by IP geolocation. Zoom from
          countries into U.S. states and counties. Named users are not shown.
        </p>
      </header>

      <FilterBar cases={cases} filters={filters} onChange={setFilters} compact showSearch />

      <div className="mb-4 grid gap-3 border border-line bg-card p-4 md:grid-cols-3">
        <fieldset>
          <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Activity</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Toggle pressed={metric === "started"} onClick={() => setMetric("started")}>
              Started
            </Toggle>
            <Toggle pressed={metric === "completed"} onClick={() => setMetric("completed")}>
              Started and completed
            </Toggle>
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Map type</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Toggle pressed={layer === "bubbles"} onClick={() => setLayer("bubbles")}>
              Bubbles
            </Toggle>
            <Toggle pressed={layer === "heatmap"} onClick={() => setLayer("heatmap")}>
              Heatmap
            </Toggle>
            <Toggle pressed={layer === "regions"} onClick={() => setLayer("regions")}>
              Regions
            </Toggle>
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Grouping</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Toggle pressed={group === "overall"} onClick={() => setGroup("overall")}>
              Overall
            </Toggle>
            <Toggle
              pressed={group === "case"}
              onClick={() => {
                setGroup("case");
                setLayer("bubbles");
              }}
            >
              By case
            </Toggle>
          </div>
        </fieldset>
      </div>

      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <p className="mb-3 text-[12px] text-ink-soft">
        {starts} placed session{starts === 1 ? "" : "s"}
        {metric === "completed" ? "" : ` · ${completions} completed (${formatPercent(starts ? completions / starts : 0)})`}
        {unplaced ? ` · ${unplaced} without a locatable city or region` : ""}
        {placing ? " · locating cities…" : ""}
        {layer === "regions" ? ` · region view: ${grainLabel} (zoom to change)` : ""}
      </p>
      {group === "case" && caseLegend.length ? (
        <ul className="mb-3 flex flex-wrap gap-3 text-[12px] text-ink-soft">
          {caseLegend.map((item) => (
            <li key={item.name} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: item.color }} aria-hidden />
              {item.name}
            </li>
          ))}
        </ul>
      ) : null}

      {buckets.length === 0 && !placing ? (
        <div className="border border-dashed border-line bg-card px-6 py-16 text-center">
          <p className="font-serif text-xl text-ink">No locatable sessions in this range</p>
          <p className="mt-2 text-sm text-ink-soft">
            New sessions include city-level coordinates from IP geolocation. Older events can still place if
            they have a city or U.S. state.
          </p>
        </div>
      ) : (
        <Suspense fallback={<div className="usage-map grid place-items-center text-sm text-ink-soft">Loading map…</div>}>
          <UsageMap
            buckets={buckets}
            layer={group === "case" ? "bubbles" : layer}
            group={group}
            grain={grain}
            onGrainChange={setGrain}
          />
        </Suspense>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <CountTable
          title="Locations"
          caption="City-level buckets used on the map. Click a bubble for case mix."
          rows={buckets.slice(0, 12).map((b) => ({
            label: b.label,
            n: b.starts,
            pct: starts ? b.starts / starts : 0,
          }))}
          empty="No locations to list."
        />
        <section className="border border-line bg-card p-4 text-sm leading-6 text-ink-soft">
          <h2 className="font-serif text-lg text-ink">How to read this</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Started counts every anonymous session. Started and completed keeps only sessions that reached the last step.</li>
            <li>Use the date range and case filters above. Overall pools selected cases; by case splits bubbles by case color.</li>
            <li>Zoom in on Regions to move from countries to U.S. states, then counties. Other countries stay at country or city level.</li>
            <li>Placement is IP geolocation (city-level). The IP itself is not stored. This is not a named user or hospital map.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Toggle({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={[
        "rounded-sm border px-3 py-1.5 text-sm",
        pressed ? "border-teal bg-teal text-card" : "border-line bg-paper text-ink hover:border-teal",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
