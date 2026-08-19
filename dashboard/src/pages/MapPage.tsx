import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { CountTable } from "../components/CountTable";
import { FilterBar } from "../components/FilterBar";
import { formatPercent, formatRange, rangeForPreset } from "../lib/dates";
import { applyClientFilters, fetchCaseEvents } from "../lib/fetchEvents";
import {
  bucketLocations,
  bucketsForScope,
  caseColors,
  placeSessions,
  sessionsForMetric,
  VOLUME_LEGEND,
  type LocationBucket,
  type MapGrain,
  type MapGroup,
  type MapLayer,
  type MapMetric,
  type MapScope,
  type UsaLevel,
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
  const [scope, setScope] = useState<MapScope>("world");
  const [usaLevel, setUsaLevel] = useState<UsaLevel>("state");
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

  const visible = useMemo(() => bucketsForScope(buckets, scope), [buckets, scope]);
  const starts = visible.reduce((n, b) => n + b.starts, 0);
  const completions = visible.reduce((n, b) => n + b.completions, 0);
  const grainLabel = grain === "country" ? "countries" : grain === "state" ? "states" : "counties";
  const caseLegend = useMemo(() => {
    const names = [...new Set(visible.flatMap((b) => Object.values(b.cases).map((c) => c.name)))].sort();
    const colors = caseColors(names);
    return names.map((name) => ({ name, color: colors[name] ?? "#1f6a66" }));
  }, [visible]);

  const usa = scope === "usa";
  const showPointLayers = !usa || usaLevel === "location";
  const showMap = placing || buckets.length > 0 || usa;

  return (
    <div>
      <header className="mb-6 border-b border-ink pb-5">
        <p className="text-[11px] font-medium tracking-[0.18em] text-teal uppercase">Geography</p>
        <h1 className="font-serif mt-1 text-3xl text-ink">Usage map</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
          Anonymous sessions for {formatRange(bounds.from, bounds.to)}, placed by IP geolocation. Use United States
          for locked state, county, and city-level views. Named users are not shown.
        </p>
      </header>

      <FilterBar cases={cases} filters={filters} onChange={setFilters} compact showSearch />

      <div className="mb-4 grid gap-3 border border-line bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
        <fieldset>
          <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Scope</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Toggle pressed={!usa} onClick={() => setScope("world")}>
              World
            </Toggle>
            <Toggle
              pressed={usa}
              onClick={() => {
                setScope("usa");
                setUsaLevel("state");
                setGroup("overall");
              }}
            >
              United States
            </Toggle>
          </div>
        </fieldset>
        {usa ? (
          <fieldset>
            <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">USA view</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <Toggle
                pressed={usaLevel === "state"}
                onClick={() => {
                  setUsaLevel("state");
                  setGroup("overall");
                }}
              >
                States
              </Toggle>
              <Toggle
                pressed={usaLevel === "county"}
                onClick={() => {
                  setUsaLevel("county");
                  setGroup("overall");
                }}
              >
                Counties
              </Toggle>
              <Toggle
                pressed={usaLevel === "location"}
                onClick={() => {
                  setUsaLevel("location");
                  setLayer("bubbles");
                }}
              >
                Locations
              </Toggle>
            </div>
          </fieldset>
        ) : (
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
        )}
        {usa && usaLevel === "location" ? (
          <fieldset>
            <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Location style</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <Toggle pressed={layer !== "heatmap"} onClick={() => setLayer("bubbles")}>
                Bubbles
              </Toggle>
              <Toggle pressed={layer === "heatmap"} onClick={() => setLayer("heatmap")}>
                Heatmap
              </Toggle>
            </div>
          </fieldset>
        ) : (
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
        )}
        <fieldset>
          <legend className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">
            {usa && usaLevel === "location" ? "Activity" : "Grouping"}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {usa && usaLevel === "location" ? (
              <>
                <Toggle pressed={metric === "started"} onClick={() => setMetric("started")}>
                  Started
                </Toggle>
                <Toggle pressed={metric === "completed"} onClick={() => setMetric("completed")}>
                  Started and completed
                </Toggle>
              </>
            ) : (
              <>
                <Toggle pressed={group === "overall"} onClick={() => setGroup("overall")}>
                  Overall
                </Toggle>
                <Toggle
                  pressed={group === "case"}
                  onClick={() => {
                    setGroup("case");
                    setLayer("bubbles");
                    if (usa) setUsaLevel("location");
                  }}
                >
                  By case
                </Toggle>
              </>
            )}
          </div>
        </fieldset>
      </div>

      {usa && usaLevel === "location" ? (
        <div className="mb-4 border border-line bg-card p-4">
          <p className="text-[11px] font-medium tracking-[0.12em] text-ink-soft uppercase">Grouping</p>
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
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <p className="mb-3 text-[12px] text-ink-soft">
        {starts} placed {usa ? "U.S. " : ""}session{starts === 1 ? "" : "s"}
        {metric === "completed" ? "" : ` · ${completions} completed (${formatPercent(starts ? completions / starts : 0)})`}
        {unplaced ? ` · ${unplaced} without a locatable city or region` : ""}
        {placing ? " · locating cities…" : ""}
        {usa
          ? ` · locked to ${usaLevel === "state" ? "states" : usaLevel === "county" ? "counties" : "city-level locations"}`
          : layer === "regions"
            ? ` · region view: ${grainLabel} (zoom to change)`
            : ""}
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
      ) : (
        <div className="map-legend" aria-label="Session count colors">
          <span>Fewer</span>
          <ul>
            {VOLUME_LEGEND.map((item) => (
              <li key={item.label}>
                <span style={{ background: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
          <span>More sessions</span>
        </div>
      )}

      {!showMap ? (
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
            buckets={visible}
            layer={showPointLayers ? (group === "case" ? "bubbles" : layer) : "regions"}
            group={group}
            grain={grain}
            scope={scope}
            usaLevel={usaLevel}
            metric={metric}
            onGrainChange={setGrain}
          />
        </Suspense>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <CountTable
          title={usa ? "United States locations" : "Locations"}
          caption={
            usaLevel === "location" || !usa
              ? "City-level buckets. Color and size follow session count. Click a bubble for case mix."
              : "Counts rolled up to the selected U.S. geography."
          }
          rows={visible.slice(0, 12).map((b) => ({
            label: b.label,
            n: metric === "completed" ? b.completions : b.starts,
            pct: (metric === "completed" ? completions : starts)
              ? (metric === "completed" ? b.completions : b.starts) / (metric === "completed" ? completions : starts)
              : 0,
          }))}
          empty={usa ? "No United States sessions in this range." : "No locations to list."}
        />
        <section className="border border-line bg-card p-4 text-sm leading-6 text-ink-soft">
          <h2 className="font-serif text-lg text-ink">How to read this</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>United States locks the map to the U.S. and switches with buttons: states, counties, or city-level locations.</li>
            <li>Colors move from teal to gold to copper to red as more sessions share a place. Heatmaps use the same ramp.</li>
            <li>Started counts every anonymous session. Started and completed keeps only sessions that reached the last step.</li>
            <li>Locations are IP geolocation (city-level), not a named user, hospital, or street address. The IP itself is not stored.</li>
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