export function normName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const COUNTRY_ALIASES: Record<string, string> = {
  us: "United States of America",
  usa: "United States of America",
  "united states": "United States of America",
  "united states of america": "United States of America",
  "u s": "United States of America",
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
  "great britain": "United Kingdom",
  gb: "United Kingdom",
  korea: "South Korea",
  "south korea": "South Korea",
  "republic of korea": "South Korea",
  russia: "Russia",
  "russian federation": "Russia",
};

export const COUNTRY_ISO: Record<string, string> = {
  "united states of america": "US",
  "united states": "US",
  canada: "CA",
  mexico: "MX",
  "united kingdom": "GB",
  australia: "AU",
  india: "IN",
  germany: "DE",
  france: "FR",
  spain: "ES",
  italy: "IT",
  brazil: "BR",
  japan: "JP",
  china: "CN",
  "south korea": "KR",
  "new zealand": "NZ",
  ireland: "IE",
  netherlands: "NL",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  switzerland: "CH",
  "south africa": "ZA",
  nigeria: "NG",
  kenya: "KE",
  egypt: "EG",
  "saudi arabia": "SA",
  "united arab emirates": "AE",
  israel: "IL",
  turkey: "TR",
  argentina: "AR",
  chile: "CL",
  colombia: "CO",
  peru: "PE",
  singapore: "SG",
  "hong kong": "HK",
  taiwan: "TW",
  philippines: "PH",
  indonesia: "ID",
  thailand: "TH",
  vietnam: "VN",
  pakistan: "PK",
  bangladesh: "BD",
  poland: "PL",
  portugal: "PT",
  greece: "GR",
  belgium: "BE",
  austria: "AT",
  finland: "FI",
};

export const US_STATE_CENTROIDS: Record<string, { lat: number; lng: number; name: string }> = {
  alabama: { lat: 32.81, lng: -86.79, name: "Alabama" },
  alaska: { lat: 64.2, lng: -153.37, name: "Alaska" },
  arizona: { lat: 34.05, lng: -111.09, name: "Arizona" },
  arkansas: { lat: 34.97, lng: -92.37, name: "Arkansas" },
  california: { lat: 37.16, lng: -119.45, name: "California" },
  colorado: { lat: 39.06, lng: -105.31, name: "Colorado" },
  connecticut: { lat: 41.6, lng: -72.76, name: "Connecticut" },
  delaware: { lat: 38.98, lng: -75.51, name: "Delaware" },
  florida: { lat: 27.77, lng: -81.69, name: "Florida" },
  georgia: { lat: 32.64, lng: -83.44, name: "Georgia" },
  hawaii: { lat: 20.29, lng: -156.37, name: "Hawaii" },
  idaho: { lat: 44.39, lng: -114.66, name: "Idaho" },
  illinois: { lat: 40.04, lng: -89.3, name: "Illinois" },
  indiana: { lat: 39.89, lng: -86.28, name: "Indiana" },
  iowa: { lat: 42.08, lng: -93.5, name: "Iowa" },
  kansas: { lat: 38.53, lng: -98.2, name: "Kansas" },
  kentucky: { lat: 37.53, lng: -85.3, name: "Kentucky" },
  louisiana: { lat: 31.17, lng: -91.87, name: "Louisiana" },
  maine: { lat: 45.37, lng: -69.24, name: "Maine" },
  maryland: { lat: 39.06, lng: -76.8, name: "Maryland" },
  massachusetts: { lat: 42.23, lng: -71.53, name: "Massachusetts" },
  michigan: { lat: 44.35, lng: -85.41, name: "Michigan" },
  minnesota: { lat: 46.28, lng: -94.31, name: "Minnesota" },
  mississippi: { lat: 32.74, lng: -89.68, name: "Mississippi" },
  missouri: { lat: 38.46, lng: -92.29, name: "Missouri" },
  montana: { lat: 47.05, lng: -109.63, name: "Montana" },
  nebraska: { lat: 41.54, lng: -99.81, name: "Nebraska" },
  nevada: { lat: 39.33, lng: -116.63, name: "Nevada" },
  "new hampshire": { lat: 43.68, lng: -71.58, name: "New Hampshire" },
  "new jersey": { lat: 40.19, lng: -74.67, name: "New Jersey" },
  "new mexico": { lat: 34.41, lng: -106.11, name: "New Mexico" },
  "new york": { lat: 42.95, lng: -75.53, name: "New York" },
  "north carolina": { lat: 35.56, lng: -79.39, name: "North Carolina" },
  "north dakota": { lat: 47.45, lng: -100.47, name: "North Dakota" },
  ohio: { lat: 40.29, lng: -82.79, name: "Ohio" },
  oklahoma: { lat: 35.57, lng: -97.51, name: "Oklahoma" },
  oregon: { lat: 43.93, lng: -120.56, name: "Oregon" },
  pennsylvania: { lat: 40.88, lng: -77.8, name: "Pennsylvania" },
  "rhode island": { lat: 41.68, lng: -71.56, name: "Rhode Island" },
  "south carolina": { lat: 33.92, lng: -80.9, name: "South Carolina" },
  "south dakota": { lat: 44.44, lng: -100.23, name: "South Dakota" },
  tennessee: { lat: 35.86, lng: -86.35, name: "Tennessee" },
  texas: { lat: 31.48, lng: -99.33, name: "Texas" },
  utah: { lat: 39.31, lng: -111.67, name: "Utah" },
  vermont: { lat: 44.07, lng: -72.67, name: "Vermont" },
  virginia: { lat: 37.52, lng: -78.85, name: "Virginia" },
  washington: { lat: 47.4, lng: -121.49, name: "Washington" },
  "west virginia": { lat: 38.64, lng: -80.62, name: "West Virginia" },
  wisconsin: { lat: 44.27, lng: -89.62, name: "Wisconsin" },
  wyoming: { lat: 43.0, lng: -107.55, name: "Wyoming" },
  "district of columbia": { lat: 38.91, lng: -77.01, name: "District of Columbia" },
  dc: { lat: 38.91, lng: -77.01, name: "District of Columbia" },
};

const USPS: Record<string, string> = {
  al: "alabama",
  ak: "alaska",
  az: "arizona",
  ar: "arkansas",
  ca: "california",
  co: "colorado",
  ct: "connecticut",
  de: "delaware",
  fl: "florida",
  ga: "georgia",
  hi: "hawaii",
  id: "idaho",
  il: "illinois",
  in: "indiana",
  ia: "iowa",
  ks: "kansas",
  ky: "kentucky",
  la: "louisiana",
  me: "maine",
  md: "maryland",
  ma: "massachusetts",
  mi: "michigan",
  mn: "minnesota",
  ms: "mississippi",
  mo: "missouri",
  mt: "montana",
  ne: "nebraska",
  nv: "nevada",
  nh: "new hampshire",
  nj: "new jersey",
  nm: "new mexico",
  ny: "new york",
  nc: "north carolina",
  nd: "north dakota",
  oh: "ohio",
  ok: "oklahoma",
  or: "oregon",
  pa: "pennsylvania",
  ri: "rhode island",
  sc: "south carolina",
  sd: "south dakota",
  tn: "tennessee",
  tx: "texas",
  ut: "utah",
  vt: "vermont",
  va: "virginia",
  wa: "washington",
  wv: "west virginia",
  wi: "wisconsin",
  wy: "wyoming",
  dc: "district of columbia",
};

export function countyKey(name: string): string {
  return normName(name.replace(/\b(county|parish|borough|census area|municipio)\b/gi, ""));
}

export function inUnitedStatesView(lng: number, lat: number): boolean {
  const continental = lng > -125 && lng < -66 && lat > 24 && lat < 50;
  const alaska = lng > -170 && lng < -129 && lat > 51 && lat < 72;
  const hawaii = lng > -161 && lng < -154 && lat > 18 && lat < 23;
  return continental || alaska || hawaii;
}

export function canonicalCountry(name: string): string {
  const key = normName(name);
  return COUNTRY_ALIASES[key] ?? name.trim();
}

export function isUnitedStates(name: string): boolean {
  return canonicalCountry(name) === "United States of America";
}

export function canonicalState(name: string): string {
  const key = normName(name);
  const direct = US_STATE_CENTROIDS[key];
  if (direct) return direct.name;
  const usps = USPS[key];
  const fromCode = usps ? US_STATE_CENTROIDS[usps] : undefined;
  if (fromCode) return fromCode.name;
  return name.trim();
}

export function countryIso(name: string): string | undefined {
  const canonical = canonicalCountry(name);
  return COUNTRY_ISO[normName(canonical)] ?? COUNTRY_ISO[normName(name)];
}

export function stateCentroid(name: string): { lat: number; lng: number } | null {
  const key = normName(canonicalState(name));
  const hit = US_STATE_CENTROIDS[key];
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

/** Best-effort U.S. state from coordinates when region metadata is missing. */
export function nearestUsState(lat: number, lng: number): string | null {
  let best: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const [key, c] of Object.entries(US_STATE_CENTROIDS)) {
    if (key === "dc") continue;
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c.name;
    }
  }
  // Reject points that are clearly outside the U.S. neighborhood.
  if (bestD > 25) return null;
  return best;
}

export function resolveUsState(bucket: { region: string; country: string; lat: number; lng: number }): string | null {
  if (!isUnitedStates(bucket.country)) return null;
  if (bucket.region) {
    const name = canonicalState(bucket.region);
    if (stateCentroid(name)) return name;
  }
  return nearestUsState(bucket.lat, bucket.lng);
}

type Ring = number[][];

function ringContains(ring: Ring, lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if (xi == null || yi == null || xj == null || yj == null) continue;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInCoords(coords: unknown, lng: number, lat: number): boolean {
  if (!Array.isArray(coords) || coords.length === 0) return false;
  const first = coords[0];
  if (!Array.isArray(first) || first.length === 0) return false;
  const firstPt = first[0];
  if (typeof firstPt === "number") {
    return ringContains(coords as Ring, lng, lat);
  }
  const inner = first[0];
  if (Array.isArray(inner) && typeof inner[0] === "number") {
    const polygon = coords as Ring[];
    if (!ringContains(polygon[0] ?? [], lng, lat)) return false;
    for (let i = 1; i < polygon.length; i++) {
      if (ringContains(polygon[i] ?? [], lng, lat)) return false;
    }
    return true;
  }
  return (coords as unknown[]).some((part) => pointInCoords(part, lng, lat));
}

export function featureContains(feature: GeoJSON.Feature, lng: number, lat: number): boolean {
  const geom = feature.geometry;
  if (!geom) return false;
  if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
    return pointInCoords(geom.coordinates, lng, lat);
  }
  return false;
}
