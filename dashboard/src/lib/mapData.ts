import {
  canonicalCountry,
  canonicalState,
  countryIso,
  isUnitedStates,
  stateCentroid,
} from "./geo";
import type { SessionSummary } from "./reporting";

export type MapMetric = "started" | "completed";
export type MapLayer = "heatmap" | "bubbles" | "regions";
export type MapGrain = "country" | "state" | "county";
export type MapGroup = "overall" | "case";

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

export function pointsGeoJSON(buckets: LocationBucket[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: buckets.map((b) => ({
      type: "Feature",
      properties: {
        key: b.key,
        label: b.label,
        starts: b.starts,
        completions: b.completions,
        rate: b.starts ? b.completions / b.starts : 0,
        city: b.city,
        region: b.region,
        country: b.country,
        cases: Object.values(b.cases)
          .map((c) => `${c.name} (${c.n})`)
          .join(", "),
      },
      geometry: { type: "Point", coordinates: [b.lng, b.lat] },
    })),
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
