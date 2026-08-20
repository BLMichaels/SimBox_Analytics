import {
  canonicalCountry,
  canonicalState,
  countryIso,
  isUnitedStates,
  stateCentroid,
} from "./geo";
import type { SessionSummary } from "./reporting";

export type MapMetric = "started" | "completed";
export type MapDisplay = "count" | "share";
export type MapLayer = "heatmap" | "bubbles" | "regions";
export type MapGrain = "country" | "state" | "county";
export type MapGroup = "overall" | "case";
export type MapScope = "world" | "usa";
export type UsaLevel = "state" | "county" | "location";

export function bucketsForScope(buckets: LocationBucket[], scope: MapScope): LocationBucket[] {
  if (scope !== "usa") return buckets;
  return buckets.filter((b) => isUnitedStates(b.country));
}

export function bucketValue(bucket: LocationBucket, metric: MapMetric): number {
  return metric === "completed" ? bucket.completions : bucket.starts;
}

export function bucketsMetricTotal(buckets: LocationBucket[], metric: MapMetric): number {
  return buckets.reduce((n, b) => n + bucketValue(b, metric), 0);
}

export function caseMetricTotal(buckets: LocationBucket[], metric: MapMetric): number {
  let total = 0;
  for (const b of buckets) {
    for (const c of Object.values(b.cases)) {
      total += metric === "completed" ? c.completions : c.n;
    }
  }
  return total;
}

export type BucketVisual = {
  count: number;
  share: number;
  value: number;
  color: string;
  weight: number;
  radius: number;
};

export function bucketVisual(
  count: number,
  total: number,
  display: MapDisplay,
): BucketVisual {
  const share = total > 0 ? count / total : 0;
  const value = display === "share" ? share * 100 : count;
  return {
    count,
    share,
    value,
    color: display === "share" ? shareColor(value) : volumeColor(count),
    weight: display === "share" ? shareWeight(share) : volumeWeight(count),
    radius: display === "share" ? shareRadius(share, total) : volumeRadius(count),
  };
}

/** Absolute volume ramp so 1 vs 2 vs 5 sessions is visible even with sparse data. */
const VOLUME_STOPS: Array<[number, string]> = [
  [1, "#8fbfba"],
  [2, "#1f6a66"],
  [4, "#c4a35a"],
  [8, "#9a4f2c"],
  [16, "#8f2d2d"],
];

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [Number.parseInt(n.slice(0, 2), 16), Number.parseInt(n.slice(2, 4), 16), Number.parseInt(n.slice(4, 6), 16)];
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

export function volumeColor(value: number): string {
  if (value <= 0) return "rgba(0,0,0,0)";
  const stops = VOLUME_STOPS;
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return "#1f6a66";
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (!prev || !next) continue;
    if (value <= next[0]) {
      const t = (value - prev[0]) / (next[0] - prev[0]);
      const a = hexToRgb(prev[1]);
      const b = hexToRgb(next[1]);
      return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return last[1];
}

export function volumeWeight(value: number): number {
  if (value <= 0) return 0;
  return Math.min(1, 0.45 + Math.log2(value + 1) / 5);
}

export function volumeRadius(value: number): number {
  if (value <= 0) return 0;
  return 8 + Math.min(22, Math.log2(value + 1) * 7);
}

export const VOLUME_LEGEND = [
  { label: "1", color: volumeColor(1) },
  { label: "2", color: volumeColor(2) },
  { label: "4", color: volumeColor(4) },
  { label: "8", color: volumeColor(8) },
  { label: "16+", color: volumeColor(16) },
];

/** Share-of-total ramp (percentage points). */
const SHARE_STOPS: Array<[number, string]> = [
  [0.5, "#8fbfba"],
  [1, "#1f6a66"],
  [2, "#5a8f6a"],
  [5, "#c4a35a"],
  [10, "#9a4f2c"],
  [25, "#8f2d2d"],
];

export function shareColor(pct: number): string {
  if (pct <= 0) return "rgba(0,0,0,0)";
  const stops = SHARE_STOPS;
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return "#1f6a66";
  if (pct <= first[0]) return first[1];
  if (pct >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (!prev || !next) continue;
    if (pct <= next[0]) {
      const t = (pct - prev[0]) / (next[0] - prev[0]);
      const a = hexToRgb(prev[1]);
      const b = hexToRgb(next[1]);
      return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return last[1];
}

export function shareWeight(share: number): number {
  if (share <= 0) return 0;
  return Math.min(1, 0.35 + share * 6);
}

export function shareRadius(share: number, total: number): number {
  if (share <= 0) return 0;
  const equiv = Math.max(1, share * total);
  return 8 + Math.min(22, Math.log2(equiv + 1) * 7);
}

export const SHARE_LEGEND = [
  { label: "<1%", color: shareColor(0.5) },
  { label: "1%", color: shareColor(1) },
  { label: "2%", color: shareColor(2) },
  { label: "5%", color: shareColor(5) },
  { label: "10%+", color: shareColor(10) },
];

export type PlacedSession = SessionSummary & {
  lat: number;
  lng: number;
  place: string;
};

export type LocationBucket = {
  key: string;
  label: string;
  lat: number;
  lng: number;
  country: string;
  region: string;
  county: string;
  city: string;
  starts: number;
  completions: number;
  cases: Record<string, { name: string; n: number; completions: number }>;
};

const geoCache = new Map<string, { lat: number; lng: number }>();

function cacheKey(s: SessionSummary): string {
  return [s.city, s.region, s.country].map((v) => v.trim().toLowerCase()).join("|");
}

export function sessionsForMetric(sessions: SessionSummary[], metric: MapMetric): SessionSummary[] {
  if (metric === "completed") return sessions.filter((s) => s.outcome === "completed");
  return sessions;
}

async function geocode(s: SessionSummary): Promise<{ lat: number; lng: number } | null> {
  const key = cacheKey(s);
  if (geoCache.has(key)) return geoCache.get(key) ?? null;
  const stored = (() => {
    try {
      return sessionStorage.getItem(`simbox.geo:${key}`);
    } catch {
      return null;
    }
  })();
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { lat: number; lng: number };
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
        geoCache.set(key, parsed);
        return parsed;
      }
    } catch {
      /* ignore */
    }
  }

  const iso = s.country ? countryIso(s.country) : undefined;
  if (s.city) {
    const params = new URLSearchParams({ name: s.city, count: "1", language: "en" });
    if (iso) params.set("country", iso);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
      if (res.ok) {
        const body = (await res.json()) as { results?: Array<{ latitude: number; longitude: number }> };
        const hit = body.results?.[0];
        if (hit && Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude)) {
          const coords = { lat: hit.latitude, lng: hit.longitude };
          geoCache.set(key, coords);
          try {
            sessionStorage.setItem(`simbox.geo:${key}`, JSON.stringify(coords));
          } catch {
            /* private mode */
          }
          return coords;
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (s.region && isUnitedStates(s.country)) {
    const centroid = stateCentroid(s.region);
    if (centroid) {
      geoCache.set(key, centroid);
      return centroid;
    }
  }
  return null;
}

export async function placeSessions(sessions: SessionSummary[]): Promise<PlacedSession[]> {
  const unique = new Map<string, SessionSummary>();
  for (const s of sessions) {
    const key = cacheKey(s);
    if (!unique.has(key)) unique.set(key, s);
  }
  for (const s of unique.values()) {
    if (s.latitude != null && s.longitude != null) continue;
    if (!s.city && !s.region && !s.country) continue;
    await geocode(s);
  }

  const out: PlacedSession[] = [];
  for (const s of sessions) {
    const fromEvent =
      s.latitude != null && s.longitude != null ? { lat: s.latitude, lng: s.longitude } : null;
    const fromCache = geoCache.get(cacheKey(s)) ?? null;
    const fromState = s.region && isUnitedStates(s.country) ? stateCentroid(s.region) : null;
    const coords = fromEvent ?? fromCache ?? fromState;
    if (!coords) continue;
    const place = [s.city, s.region, s.country].filter(Boolean).join(", ") || "Unknown";
    out.push({ ...s, lat: coords.lat, lng: coords.lng, place });
  }
  return out;
}

export function bucketLocations(placed: PlacedSession[]): LocationBucket[] {
  const map = new Map<string, LocationBucket>();
  for (const s of placed) {
    const key = `${s.lat.toFixed(3)},${s.lng.toFixed(3)}|${s.country}|${s.region}|${s.city}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: s.place,
        lat: s.lat,
        lng: s.lng,
        country: canonicalCountry(s.country || "Unknown"),
        region: s.region ? canonicalState(s.region) : "",
        county: s.county || "",
        city: s.city,
        starts: 0,
        completions: 0,
        cases: {},
      };
      map.set(key, bucket);
    }
    bucket.starts += 1;
    if (s.outcome === "completed") bucket.completions += 1;
    const caseKey = s.case_key || s.case_name;
    const current = bucket.cases[caseKey] ?? { name: s.case_name, n: 0, completions: 0 };
    current.n += 1;
    if (s.outcome === "completed") current.completions += 1;
    bucket.cases[caseKey] = current;
  }
  return [...map.values()].sort((a, b) => b.starts - a.starts);
}

export function pointsGeoJSON(
  buckets: LocationBucket[],
  metric: MapMetric = "started",
  display: MapDisplay = "count",
  total?: number,
): GeoJSON.FeatureCollection {
  const denom = total ?? bucketsMetricTotal(buckets, metric);
  return {
    type: "FeatureCollection",
    features: buckets.map((b) => {
      const count = bucketValue(b, metric);
      const visual = bucketVisual(count, denom, display);
      return {
        type: "Feature",
        properties: {
          key: b.key,
          label: b.label,
          starts: b.starts,
          completions: b.completions,
          count,
          share: visual.share,
          value: visual.value,
          display,
          weight: visual.weight,
          radius: visual.radius,
          color: visual.color,
          rate: b.starts ? b.completions / b.starts : 0,
          city: b.city,
          region: b.region,
          country: b.country,
          cases: Object.values(b.cases)
            .map((c) => `${c.name} (${c.n})`)
            .join(", "),
        },
        geometry: { type: "Point", coordinates: [b.lng, b.lat] },
      };
    }),
  };
}

export type RegionStat = {
  id: string;
  name: string;
  starts: number;
  completions: number;
};

export function aggregateRegions(placed: PlacedSession[], grain: MapGrain): Map<string, RegionStat> {
  const map = new Map<string, RegionStat>();
  for (const s of placed) {
    let name = "";
    if (grain === "country") name = canonicalCountry(s.country || "Unknown");
    else if (grain === "state") {
      if (isUnitedStates(s.country) && s.region) name = canonicalState(s.region);
      else name = canonicalCountry(s.country || "Unknown");
    } else {
      name = [s.city, s.region || canonicalCountry(s.country)].filter(Boolean).join(", ");
    }
    if (!name) continue;
    const id = name.toLowerCase();
    const cur = map.get(id) ?? { id, name, starts: 0, completions: 0 };
    cur.starts += 1;
    if (s.outcome === "completed") cur.completions += 1;
    map.set(id, cur);
  }
  return map;
}

export function caseColors(names: string[]): Record<string, string> {
  const palette = ["#1f6a66", "#9a4f2c", "#1c2430", "#2c6b3f", "#5b4b8a", "#8f2d2d", "#3d6ea8", "#b5812f"];
  const out: Record<string, string> = {};
  names.forEach((name, i) => {
    out[name] = palette[i % palette.length] ?? "#1f6a66";
  });
  return out;
}
