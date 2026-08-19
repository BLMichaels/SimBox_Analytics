import { useEffect, useRef } from "react";
import { LngLatBounds, Map as MapLibreMap, NavigationControl, Popup, ScaleControl } from "maplibre-gl";
import type { GeoJSONSource, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { canonicalCountry, canonicalState, countyKey, featureContains, inUnitedStatesView, isUnitedStates, normName } from "../lib/geo";
import type { LocationBucket, MapGrain, MapGroup, MapLayer } from "../lib/mapData";
import { caseColors, pointsGeoJSON } from "../lib/mapData";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  buckets: LocationBucket[];
  layer: MapLayer;
  group: MapGroup;
  grain: MapGrain;
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

type Atlas = { countries?: GeoJSON.FeatureCollection; states?: GeoJSON.FeatureCollection; counties?: GeoJSON.FeatureCollection };
const atlas: Atlas = {};

async function loadTopo(url: string, objectName: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("map");
  const topo = (await res.json()) as Topology;
  const obj = topo.objects[objectName];
  if (!obj) return { type: "FeatureCollection", features: [] };
  const fc = feature(topo, obj) as unknown as GeoJSON.FeatureCollection;
  return fc;
}

async function ensureAtlas(grain: MapGrain): Promise<Atlas> {
  if (!atlas.countries) {
    atlas.countries = await loadTopo(
      "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json",
      "countries",
    );
  }
  if (grain !== "country" && !atlas.states) {
    atlas.states = await loadTopo("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json", "states");
  }
  if (grain === "county" && !atlas.counties) {
    atlas.counties = await loadTopo("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json", "counties");
  }
  return atlas;
}

function featureName(f: GeoJSON.Feature): string {
  const p = f.properties ?? {};
  return String(p.name ?? p.NAME ?? p.ADMIN ?? p.geonunit ?? "");
}

function paintRegions(features: GeoJSON.Feature[], buckets: LocationBucket[], grain: MapGrain): GeoJSON.FeatureCollection {
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
      else add(canonicalCountry(b.country), b);
    } else {
      const hit = features.find((f) => featureContains(f, b.lng, b.lat));
      if (hit) add(String(hit.id ?? featureName(hit)), b);
      else if (b.county) add(countyKey(b.county), b);
    }
  }

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
      return {
        ...f,
        properties: {
          ...f.properties,
          label: featureName(f),
          starts: stat?.starts ?? 0,
          completions: stat?.completions ?? 0,
          rate: stat?.starts ? stat.completions / stat.starts : 0,
        },
      };
    }),
  };
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
      "fill-color": [
        "interpolate",
        ["linear"],
        ["get", "starts"],
        0,
        "rgba(31,106,102,0)",
        1,
        "#e8e2d6",
        4,
        "#9dccc7",
        12,
        "#1f6a66",
        30,
        "#164e4b",
      ],
      "fill-opacity": 0.78,
    },
  });
  map.addLayer({
    id: "region-line",
    type: "line",
    source: "regions",
    paint: { "line-color": "#1c2430", "line-width": 0.6, "line-opacity": 0.35 },
  });
  map.addLayer({
    id: "heat",
    type: "heatmap",
    source: "points",
    paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["get", "starts"], 0, 0, 8, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 6, 1.4],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 16, 8, 36],
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(31,106,102,0)",
        0.2,
        "rgba(31,106,102,0.25)",
        0.5,
        "rgba(31,106,102,0.7)",
        0.8,
        "rgba(154,79,44,0.85)",
        1,
        "rgba(143,45,45,0.95)",
      ],
    },
  });
  map.addLayer({
    id: "bubbles",
    type: "circle",
    source: "points",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "starts"], 1, 7, 8, 16, 30, 28],
      "circle-color": ["coalesce", ["get", "color"], "#1f6a66"],
      "circle-opacity": 0.82,
      "circle-stroke-width": 1.2,
      "circle-stroke-color": "#fbf8f2",
    },
  });
}

function bubbleCollection(buckets: LocationBucket[], group: MapGroup): GeoJSON.FeatureCollection {
  if (group !== "case") return pointsGeoJSON(buckets);
  const colors = caseColors(
    [...new Set(buckets.flatMap((b) => Object.values(b.cases).map((c) => c.name)))].sort(),
  );
  const features: GeoJSON.Feature[] = [];
  for (const b of buckets) {
    const entries = Object.values(b.cases);
    entries.forEach((c, i) => {
      const offset = (i - (entries.length - 1) / 2) * 0.08;
      features.push({
        type: "Feature",
        properties: {
          key: `${b.key}:${c.name}`,
          label: `${c.name} · ${b.label}`,
          starts: c.n,
          completions: c.completions,
          rate: b.starts ? b.completions / b.starts : 0,
          city: b.city,
          region: b.region,
          country: b.country,
          cases: c.name,
          color: colors[c.name] ?? "#1f6a66",
        },
        geometry: { type: "Point", coordinates: [b.lng + offset, b.lat] },
      });
    });
  }
  return { type: "FeatureCollection", features };
}

export function UsageMap({ buckets, layer, group, grain, onGrainChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const onGrain = useRef(onGrainChange);
  const fitted = useRef(false);
  onGrain.current = onGrainChange;

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: host.current,
      style: STYLE,
      center: [-40, 28],
      zoom: 1.6,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ maxWidth: 120 }), "bottom-left");
    mapRef.current = map;
    popupRef.current = new Popup({ closeButton: true, maxWidth: "280px" });

    const ready = () => addUsageLayers(map);
    map.on("load", ready);
    if (map.isStyleLoaded()) ready();

    map.on("zoomend", () => {
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
      const label = String(p.label ?? "").replace(/[&<>"']/g, (ch) => {
        const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return map[ch] ?? ch;
      });
      const cases = String(p.cases ?? "").replace(/[&<>"']/g, (ch) => {
        const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return map[ch] ?? ch;
      });
      const html = `<p style="font-weight:600;margin:0 0 4px">${label}</p>
        <p style="margin:0">${Number(p.starts ?? 0)} started · ${Number(p.completions ?? 0)} completed</p>
        ${cases ? `<p style="margin:6px 0 0">${cases}</p>` : ""}`;
      popupRef.current?.setLngLat(e.lngLat).setHTML(html).addTo(map);
    };
    map.on("click", "bubbles", showPopup);
    map.on("click", "region-fill", showPopup);
    map.on("mouseenter", "bubbles", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "bubbles", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("mouseenter", "region-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "region-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      map?.once("load", () => apply());
      return;
    }
    void apply();

    async function apply() {
      const current = mapRef.current;
      if (!current) return;
      if (current.isStyleLoaded()) addUsageLayers(current);
      const points = current.getSource("points") as GeoJSONSource | undefined;
      const regions = current.getSource("regions") as GeoJSONSource | undefined;
      if (!points || !regions) return;

      points.setData(bubbleCollection(buckets, group));
      const loaded = await ensureAtlas(grain);
      const base =
        grain === "county"
          ? loaded.counties
          : grain === "state"
            ? loaded.states
            : loaded.countries;
      regions.setData(paintRegions(base?.features ?? [], buckets, grain === "county" ? "county" : grain));

      const showHeat = layer === "heatmap";
      const showBubbles = layer === "bubbles" || (layer === "heatmap" && current.getZoom() >= 7);
      const showRegions = layer === "regions";
      current.setLayoutProperty("heat", "visibility", showHeat ? "visible" : "none");
      current.setLayoutProperty("bubbles", "visibility", showBubbles || group === "case" ? "visible" : "none");
      current.setLayoutProperty("region-fill", "visibility", showRegions ? "visible" : "none");
      current.setLayoutProperty("region-line", "visibility", showRegions ? "visible" : "none");

      if (buckets.length && !fitted.current) {
        const bounds = new LngLatBounds();
        for (const b of buckets) bounds.extend([b.lng, b.lat]);
        if (!bounds.isEmpty()) {
          current.fitBounds(bounds, { padding: 72, maxZoom: 5.2, duration: 700 });
          fitted.current = true;
        }
      }
    }
  }, [buckets, grain, group, layer]);

  return <div ref={host} className="usage-map" role="img" aria-label="Usage map" />;
}
