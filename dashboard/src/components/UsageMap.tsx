import { useEffect, useRef } from "react";
import { LngLatBounds, Map as MapLibreMap, NavigationControl, Popup, ScaleControl } from "maplibre-gl";
import type { GeoJSONSource, LngLatBoundsLike, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import {
  canonicalCountry,
  canonicalState,
  countyKey,
  featureContains,
  inUnitedStatesView,
  isUnitedStates,
  normName,
} from "../lib/geo";
import type { LocationBucket, MapDisplay, MapGrain, MapGroup, MapLayer, MapMetric, MapScope, UsaLevel } from "../lib/mapData";
import {
  bucketVisual,
  bucketsMetricTotal,
  caseColors,
  caseMetricTotal,
  pointsGeoJSON,
  shareColor,
  volumeColor,
} from "../lib/mapData";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  buckets: LocationBucket[];
  layer: MapLayer;
  group: MapGroup;
  grain: MapGrain;
  scope: MapScope;
  usaLevel: UsaLevel;
  metric: MapMetric;
  display: MapDisplay;
  onGrainChange: (grain: MapGrain) => void;
};

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

const US_MAX_BOUNDS: LngLatBoundsLike = [
  [-179.2, 16.7],
  [-64.4, 71.6],
];
const US_CONUS: LngLatBoundsLike = [
  [-124.9, 24.4],
  [-66.7, 49.4],
];

type Atlas = { countries?: GeoJSON.FeatureCollection; states?: GeoJSON.FeatureCollection; counties?: GeoJSON.FeatureCollection };
const atlas: Atlas = {};
const countyHitCache = new Map<string, string>();

async function loadTopo(url: string, objectName: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("map");
  const topo = (await res.json()) as Topology;
  const obj = topo.objects[objectName];
  if (!obj) return { type: "FeatureCollection", features: [] };
  return feature(topo, obj) as unknown as GeoJSON.FeatureCollection;
}

async function ensureAtlas(need: "country" | "state" | "county"): Promise<Atlas> {
  if (need === "country" && !atlas.countries) {
    atlas.countries = await loadTopo("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json", "countries");
  }
  if (need !== "country" && !atlas.states) {
    atlas.states = await loadTopo("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json", "states");
  }
  if (need === "county" && !atlas.counties) {
    atlas.counties = await loadTopo("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json", "counties");
  }
  return atlas;
}

function featureName(f: GeoJSON.Feature): string {
  const p = f.properties ?? {};
  return String(p.name ?? p.NAME ?? p.ADMIN ?? p.geonunit ?? "");
}

function countyIdForPoint(features: GeoJSON.Feature[], lng: number, lat: number): string {
  const key = `${lng.toFixed(3)},${lat.toFixed(3)}`;
  const cached = countyHitCache.get(key);
  if (cached != null) return cached;
  const hit = features.find((f) => featureContains(f, lng, lat));
  const id = hit ? String(hit.id ?? featureName(hit)) : "";
  countyHitCache.set(key, id);
  return id;
}

function paintRegions(
  features: GeoJSON.Feature[],
  buckets: LocationBucket[],
  grain: MapGrain,
  metric: MapMetric,
  display: MapDisplay,
): GeoJSON.FeatureCollection {
  const counts = new Map<string, { starts: number; completions: number }>();
  const add = (name: string, b: LocationBucket) => {
    const key = normName(name);
    if (!key) return;
    const cur = counts.get(key) ?? { starts: 0, completions: 0 };
    cur.starts += b.starts;
    cur.completions += b.completions;
    counts.set(key, cur);
  };

  for (const b of buckets) {
    if (grain === "country") add(canonicalCountry(b.country), b);
    else if (grain === "state") {
      if (isUnitedStates(b.country) && b.region) add(canonicalState(b.region), b);
    } else {
      const id = countyIdForPoint(features, b.lng, b.lat);
      if (id) add(id, b);
      else if (b.county) add(countyKey(b.county), b);
    }
  }

  const total = bucketsMetricTotal(buckets, metric);

  return {
    type: "FeatureCollection",
    features: features.map((f) => {
      const name =
        grain === "country"
          ? canonicalCountry(featureName(f))
          : grain === "state"
            ? canonicalState(featureName(f))
            : String(f.id ?? featureName(f));
      const stat =
        counts.get(normName(name)) ??
        counts.get(normName(featureName(f))) ??
        counts.get(countyKey(featureName(f))) ??
        counts.get(String(f.id ?? ""));
      const starts = stat?.starts ?? 0;
      const completions = stat?.completions ?? 0;
      const count = metric === "completed" ? completions : starts;
      const visual = bucketVisual(count, total, display);
      return {
        ...f,
        properties: {
          ...f.properties,
          label: featureName(f),
          starts,
          completions,
          count,
          share: visual.share,
          value: visual.value,
          display,
          color: visual.color,
          rate: starts ? completions / starts : 0,
        },
      };
    }),
  };
}

function bubbleCollection(
  buckets: LocationBucket[],
  group: MapGroup,
  metric: MapMetric,
  display: MapDisplay,
): GeoJSON.FeatureCollection {
  if (group !== "case") return pointsGeoJSON(buckets, metric, display);
  const colors = caseColors(
    [...new Set(buckets.flatMap((b) => Object.values(b.cases).map((c) => c.name)))].sort(),
  );
  const total = caseMetricTotal(buckets, metric);
  const features: GeoJSON.Feature[] = [];
  for (const b of buckets) {
    const entries = Object.values(b.cases);
    entries.forEach((c, i) => {
      const offset = (i - (entries.length - 1) / 2) * 0.08;
      const count = metric === "completed" ? c.completions : c.n;
      const visual = bucketVisual(count, total, display);
      features.push({
        type: "Feature",
        properties: {
          key: `${b.key}:${c.name}`,
          label: `${c.name} · ${b.label}`,
          starts: c.n,
          completions: c.completions,
          count,
          share: visual.share,
          value: visual.value,
          display,
          weight: visual.weight,
          radius: visual.radius,
          color: colors[c.name] ?? (display === "share" ? shareColor(visual.value) : volumeColor(count)),
          rate: c.n ? c.completions / c.n : 0,
          city: b.city,
          region: b.region,
          country: b.country,
          cases: c.name,
        },
        geometry: { type: "Point", coordinates: [b.lng + offset, b.lat] },
      });
    });
  }
  return { type: "FeatureCollection", features };
}

function addUsageLayers(map: MapLibreMap) {
  if (map.getSource("points")) return;
  map.addSource("regions", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "region-fill",
    type: "fill",
    source: "regions",
    paint: {
      "fill-color": ["coalesce", ["get", "color"], "rgba(0,0,0,0)"],
      "fill-opacity": 0.82,
    },
  });
  map.addLayer({
    id: "region-line",
    type: "line",
    source: "regions",
    paint: { "line-color": "#1c2430", "line-width": 0.7, "line-opacity": 0.45 },
  });
  map.addLayer({
    id: "heat",
    type: "heatmap",
    source: "points",
    paint: {
      "heatmap-weight": ["coalesce", ["get", "weight"], 0],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2, 1.6, 5, 2.4, 8, 3.2],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 22, 6, 34, 10, 48],
      "heatmap-opacity": 0.9,
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(31,106,102,0)",
        0.08,
        "rgba(143,191,186,0.55)",
        0.22,
        "rgba(31,106,102,0.85)",
        0.45,
        "rgba(196,163,90,0.9)",
        0.7,
        "rgba(154,79,44,0.95)",
        1,
        "rgba(143,45,45,1)",
      ],
    },
  });
  map.addLayer({
    id: "bubbles",
    type: "circle",
    source: "points",
    paint: {
      "circle-radius": ["coalesce", ["get", "radius"], 10],
      "circle-color": ["coalesce", ["get", "color"], "#1f6a66"],
      "circle-opacity": 0.88,
      "circle-stroke-width": 1.4,
      "circle-stroke-color": "#fbf8f2",
    },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch] ?? ch;
  });
}

function fitToBuckets(map: MapLibreMap, buckets: LocationBucket[], opts: { maxZoom: number; padding: number }) {
  if (!buckets.length) return;
  const bounds = new LngLatBounds();
  for (const b of buckets) {
    if (Number.isFinite(b.lng) && Number.isFinite(b.lat)) bounds.extend([b.lng, b.lat]);
  }
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: opts.padding, maxZoom: opts.maxZoom, duration: 700 });
}

export function UsageMap({ buckets, layer, group, grain, scope, usaLevel, metric, display, onGrainChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const onGrain = useRef(onGrainChange);
  const scopeRef = useRef(scope);
  const cameraKey = useRef("");
  const dataFitKey = useRef("");
  const propsRef = useRef({ buckets, layer, group, grain, scope, usaLevel, metric, display });
  onGrain.current = onGrainChange;
  scopeRef.current = scope;
  propsRef.current = { buckets, layer, group, grain, scope, usaLevel, metric, display };

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: host.current,
      style: STYLE,
      center: [-96, 38],
      zoom: 3.2,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ maxWidth: 120 }), "bottom-left");
    mapRef.current = map;
    popupRef.current = new Popup({ closeButton: true, maxWidth: "280px" });

    const boot = () => {
      addUsageLayers(map);
      void applyLayers(map);
    };
    map.on("load", boot);
    if (map.loaded() || map.isStyleLoaded()) boot();

    map.on("zoomend", () => {
      if (scopeRef.current === "usa") return;
      const z = map.getZoom();
      const { lng, lat } = map.getCenter();
      const inUs = inUnitedStatesView(lng, lat);
      let next: MapGrain = "country";
      if (inUs && z >= 6.4) next = "county";
      else if (inUs && z >= 3.6) next = "state";
      onGrain.current(next);
    });

    const showPopup = (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat?.properties) return;
      const p = feat.properties;
      const label = escapeHtml(String(p.label ?? ""));
      const cases = escapeHtml(String(p.cases ?? ""));
      const count = Number(p.count ?? p.starts ?? 0);
      const share = Number(p.share ?? 0);
      const sharePct = `${(share * 100).toFixed(share >= 0.01 ? 1 : 2)}%`;
      const isShare = String(p.display ?? "count") === "share";
      const metricLine = isShare
        ? `${count} session${count === 1 ? "" : "s"} · ${sharePct} of total`
        : `${Number(p.starts ?? 0)} started · ${Number(p.completions ?? 0)} completed`;
      const html = `<p style="font-weight:600;margin:0 0 4px">${label}</p>
        <p style="margin:0">${metricLine}</p>
        ${cases ? `<p style="margin:6px 0 0">${cases}</p>` : ""}`;
      popupRef.current?.setLngLat(e.lngLat).setHTML(html).addTo(map);
    };
    map.on("click", "bubbles", showPopup);
    map.on("click", "region-fill", showPopup);
    for (const id of ["bubbles", "region-fill"]) {
      map.on("mouseenter", id, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", id, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; applyLayers reads propsRef
  }, []);

  async function applyLayers(map: MapLibreMap) {
    const { buckets: pts, layer: lyr, group: grp, grain: gr, scope: sc, usaLevel: level, metric: met, display: disp } =
      propsRef.current;
    if (!map.isStyleLoaded()) return;
    addUsageLayers(map);
    const points = map.getSource("points") as GeoJSONSource | undefined;
    const regions = map.getSource("regions") as GeoJSONSource | undefined;
    if (!points || !regions) return;

    const usa = sc === "usa";
    const regionGrain: MapGrain = usa ? (level === "county" ? "county" : "state") : gr;
    const showPoints = !usa || level === "location";
    const showRegions = usa ? level !== "location" : lyr === "regions";
    const outlineOnly = usa && level === "location";
    const showHeat = showPoints && lyr === "heatmap" && grp !== "case";
    const showBubbles =
      showPoints && (lyr === "bubbles" || grp === "case" || (lyr === "heatmap" && map.getZoom() >= 8));

    const collection = bubbleCollection(pts, grp, met, disp);
    points.setData(collection);

    try {
      const loaded = await ensureAtlas(
        usa ? (level === "county" ? "county" : "state") : gr === "country" ? "country" : gr,
      );
      const base =
        regionGrain === "county" ? loaded.counties : regionGrain === "state" ? loaded.states : loaded.countries;
      const painted = paintRegions(base?.features ?? [], pts, regionGrain, met, disp);
      if (outlineOnly) {
        painted.features = painted.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            color: "rgba(0,0,0,0)",
            starts: 0,
            completions: 0,
            value: 0,
          },
        }));
      }
      regions.setData(painted);
    } catch {
      regions.setData({ type: "FeatureCollection", features: [] });
    }

    map.setLayoutProperty("heat", "visibility", showHeat ? "visible" : "none");
    map.setLayoutProperty("bubbles", "visibility", showBubbles ? "visible" : "none");
    map.setLayoutProperty("region-fill", "visibility", showRegions || outlineOnly ? "visible" : "none");
    map.setLayoutProperty("region-line", "visibility", showRegions || outlineOnly ? "visible" : "none");
    map.setPaintProperty("region-fill", "fill-opacity", outlineOnly ? 0 : 0.82);

    const nextCamera = `${sc}:${usa ? level : "world"}`;
    const switched = cameraKey.current !== nextCamera;
    if (switched) {
      cameraKey.current = nextCamera;
      dataFitKey.current = "";
    }

    const dataKey = `${nextCamera}:${pts.length}:${pts[0]?.key ?? ""}:${pts[pts.length - 1]?.key ?? ""}`;
    const needDataFit = pts.length > 0 && dataFitKey.current !== dataKey && (showPoints || switched);
    if (!switched && !needDataFit) return;
    if (needDataFit) dataFitKey.current = dataKey;

    if (usa) {
      map.setMaxBounds(US_MAX_BOUNDS);
      const usPoints = pts.filter((b) => isUnitedStates(b.country));
      if (level === "location" && usPoints.length) {
        fitToBuckets(map, usPoints, { padding: 72, maxZoom: 6.2 });
        return;
      }
      map.fitBounds(US_CONUS, {
        padding: level === "county" ? 28 : 36,
        maxZoom: level === "county" ? 5.4 : 4.2,
        duration: 700,
      });
    } else {
      map.setMaxBounds(null);
      if (pts.length) fitToBuckets(map, pts, { padding: 72, maxZoom: 4.6 });
      else map.easeTo({ center: [-40, 28], zoom: 1.6, duration: 500 });
    }
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once("load", () => {
        void applyLayers(map);
      });
      return;
    }
    void applyLayers(map);
  }, [buckets, display, grain, group, layer, metric, scope, usaLevel]);

  return <div ref={host} className="usage-map" role="img" aria-label="Usage map" />;
}
