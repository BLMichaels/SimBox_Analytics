import { createClient } from "npm:@supabase/supabase-js@2";
import { validateEventPayload } from "../_shared/eventPayload.ts";

/**
 * Public anonymous intake. verify_jwt is false in config.toml.
 * Secrets used here (service role, allowed origins) must be Edge Function
 * secrets — never GitHub, Storyline, Wix, or VITE_ variables.
 *
 * Rate-limit strategy (defense in depth, documented):
 * 1. Payload size cap and field validation reject junk quickly.
 * 2. Restrictive CORS (only configured origins).
 * 3. Idempotent event_key unique constraint (duplicate starts/completes/exits).
 * 4. Unknown/inactive cases return a generic 404.
 * 5. Platform: enable Supabase/API gateway rate limits on this function
 *    (for example 60 requests / IP / minute) in the hosted project. The
 *    function itself does not key off client IP and does not store IP.
 */

const MAX_BODY = 8_192;

type CorsResult = { allowed: boolean; origin: string };

const DEFAULT_ALLOWED_ORIGINS = [
  "https://blmichaels.github.io",
  "https://www.emergencysimbox.com",
  "https://emergencysimbox.com",
  "https://*.wixsite.com",
  "https://*.wix.com",
  "https://*.filesusr.com",
  "https://*.parastorage.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
];

function parseAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const fromEnv = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_ALLOWED_ORIGINS;
}

function originAllowed(origin: string | null, allowed: string[]): CorsResult {
  if (!origin) return { allowed: false, origin: "" };
  for (const rule of allowed) {
    if (rule === origin) return { allowed: true, origin };
    if (rule.startsWith("*.") ) {
      // not used
    }
    if (rule.includes("*")) {
      const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
      const wildcard = escaped.replace(/\*/g, ".*");
      if (new RegExp(`^${wildcard}$`).test(origin)) {
        return { allowed: true, origin };
      }
    }
  }
  return { allowed: false, origin };
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(
  body: Record<string, unknown>,
  status: number,
  origin: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function clipMeta(value: string, max = 64): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function clientIp(req: Request): string | null {
  const headers = [
    "cf-connecting-ip",
    "true-client-ip",
    "x-real-ip",
    "x-client-ip",
    "fly-client-ip",
  ];
  for (const name of headers) {
    const value = req.headers.get(name)?.trim();
    if (value) return value.split(",")[0]?.trim() || null;
  }
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return null;
}

async function fetchJson(url: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringField(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function applyLocality(out: Record<string, string | number>, body: Record<string, unknown>): void {
  const city = body.city;
  const region = body.region ?? body.regionName ?? body.region_name;
  const country = body.country_name ?? body.country;
  const postal = body.postal ?? body.zip;
  const county = body.county ?? body.district;
  let timezone: unknown = body.timezone;
  if (timezone && typeof timezone === "object" && !Array.isArray(timezone)) {
    timezone = (timezone as Record<string, unknown>).id ?? (timezone as Record<string, unknown>).name;
  }
  if (typeof city === "string" && city && city !== "Not found") out.city = clipMeta(city);
  if (typeof region === "string" && region) out.region = clipMeta(region);
  if (typeof county === "string" && county) out.county = clipMeta(county);
  if (typeof country === "string" && country && country.length > 2) out.country = clipMeta(country);
  else if (typeof country === "string" && country) out.country = clipMeta(country, 8);
  if (typeof postal === "string" && postal) out.postal = clipMeta(postal, 12);
  if (typeof timezone === "string" && timezone) out.timezone = clipMeta(timezone, 40);
  const lat = asCoord(body.latitude ?? body.lat, -90, 90);
  const lng = asCoord(body.longitude ?? body.lon ?? body.lng, -180, 180);
  if (lat != null && lng != null) {
    out.latitude = lat;
    out.longitude = lng;
  }

  const connection =
    body.connection && typeof body.connection === "object" && !Array.isArray(body.connection)
      ? (body.connection as Record<string, unknown>)
      : null;
  const company =
    body.company && typeof body.company === "object" && !Array.isArray(body.company)
      ? (body.company as Record<string, unknown>)
      : null;
  const org = stringField(
    company?.name,
    connection?.org,
    connection?.isp,
    body.org,
    body.isp,
    body.organization,
    body.as_name,
  );
  if (org && !out.networkOrg) out.networkOrg = clipMeta(org, 96);
}

/** Heuristic: IP org/ISP looks like a hospital / health system network. */
function hospitalFromNetworkOrg(org: string): string | null {
  const cleaned = org.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length < 4) return null;
  const lower = cleaned.toLowerCase();
  // Home broadband, clouds, and security proxies are not the hospital.
  const notHospital =
    /\b(comcast|verizon|at&?t|spectrum|cox|charter|centurylink|frontier|t-mobile|sprint|optimum|xfinity|google fiber|starlink|cloudflare|amazon|aws|microsoft|azure|digitalocean|netskope|zscaler|palo alto|penteldata|level 3|lumen|cogent|hurricane electric)\b/i;
  if (notHospital.test(lower)) return null;
  // Insurers and benefits brands share the word "health" but are not the facility.
  const insurer =
    /\b(unitedhealth|united health|elevance|anthem|cigna|aetna|humana|blue cross|bluecross|health net|centene|molina|oscar health|kaiser permanente insurance)\b/i;
  if (insurer.test(lower)) return null;
  const hospitalLike =
    /\b(hospital|hospitals|medical center|med(?:ical)?\s*ctr|health system|healthcare|health care|health services?|children'?s hospital|clinic|indian health|dignity health|banner health|trinity health|tenet|geisinger|wellstar|piedmont|novant|atrium health|advocate health|ascension|kaiser|mayo clinic|cedars[- ]sinai|emory|yale.?new.?haven|intermountain|providence health|adventhealth|hca healthcare|commonspirit|sutter health|northwell|mass general|cleveland clinic|johns hopkins)\b/i;
  if (!hospitalLike.test(lower)) return null;
  return clipMeta(cleaned, 96);
}

function asCoord(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 1000) / 1000;
}

/**
 * Notify PECC Support Tool so the hospital Activities page gets a Simulation
 * Facilitation row. Failures are logged only — analytics ingest must not fail.
 *
 * Secrets (SimBox project):
 *   PECC_SIMBOX_INGEST_URL  — https://…/functions/v1/ingest-simbox-activity
 *   SIMBOX_INGEST_SECRET    — shared with ImPACTS SIMBOX_INGEST_SECRET
 */
type HospitalDirectoryMatch = {
  matched?: boolean;
  facility_id?: string | null;
  name?: string | null;
  source?: string | null;
  confidence?: string | null;
};

function peccResolveUrl(): string {
  const explicit = Deno.env.get("PECC_SIMBOX_RESOLVE_URL")?.trim() ?? "";
  if (explicit) return explicit;
  const ingest = Deno.env.get("PECC_SIMBOX_INGEST_URL")?.trim() ?? "";
  return ingest.replace(/ingest-simbox-activity\/?$/, "resolve-simbox-hospital");
}

/**
 * Ask the PECC hospital directory which single facility this locality is.
 * High confidence: one facility shares the ZIP, or the network org names one campus.
 * Medium: the city has exactly one hospital, or a system with several campuses.
 */
async function resolveHospitalDirectory(opts: {
  city?: string;
  region?: string;
  postal?: string;
  org?: string;
}): Promise<HospitalDirectoryMatch | null> {
  const secret = Deno.env.get("SIMBOX_INGEST_SECRET")?.trim() ?? "";
  const url = peccResolveUrl();
  if (!secret || !url || !url.includes("resolve-simbox-hospital")) return null;
  if (!opts.city && !opts.postal && !opts.org) return null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-simbox-ingest-secret": secret,
      },
      body: JSON.stringify({
        city: opts.city ?? "",
        region: opts.region ?? "",
        postal: opts.postal ?? "",
        org: opts.org ?? "",
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("record-simbox-event: hospital resolve failed", res.status, text.slice(0, 160));
      return null;
    }
    return (await res.json()) as HospitalDirectoryMatch;
  } catch (err) {
    console.error("record-simbox-event: hospital resolve error", String(err));
    return null;
  }
}

async function notifyPeccActivity(opts: {
  siteKey?: string;
  facilityId?: string;
  caseKey: string;
  caseDisplayName: string;
  sessionId: string;
  occurredAt: string;
  elapsedSeconds: number | null;
}): Promise<void> {
  const url = Deno.env.get("PECC_SIMBOX_INGEST_URL")?.trim() ?? "";
  const secret = Deno.env.get("SIMBOX_INGEST_SECRET")?.trim() ?? "";
  if (!url || !secret) {
    console.warn("record-simbox-event: PECC ingest skipped (URL or secret not configured)");
    return;
  }
  const siteKey = opts.siteKey?.trim() ?? "";
  const facilityId = opts.facilityId?.trim() ?? "";
  if (siteKey && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(siteKey)) return;
  if (!siteKey && !facilityId) return;

  const hours =
    opts.elapsedSeconds != null && opts.elapsedSeconds > 0
      ? Math.round((opts.elapsedSeconds / 3600) * 4) / 4 // nearest 0.25h
      : 0;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-simbox-ingest-secret": secret,
      },
      body: JSON.stringify({
        ...(siteKey ? { site_key: siteKey } : {}),
        ...(facilityId ? { facility_id: facilityId } : {}),
        case_key: opts.caseKey,
        case_display_name: opts.caseDisplayName,
        session_id: opts.sessionId,
        occurred_at: opts.occurredAt,
        hours: hours > 0 ? hours : 0,
        participants: null,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        "record-simbox-event: PECC ingest failed",
        res.status,
        text.slice(0, 200),
      );
    }
  } catch (err) {
    console.error("record-simbox-event: PECC ingest error", String(err));
  }
}

async function lookupNetworkLocality(req: Request): Promise<Record<string, string | number>> {
  const out: Record<string, string | number> = {};
  const countryHeader = req.headers.get("cf-ipcountry");
  if (countryHeader && countryHeader !== "XX" && countryHeader !== "T1") {
    out.country = clipMeta(countryHeader, 8);
  }
  const cityHeader = req.headers.get("cf-ipcity");
  if (cityHeader) out.city = clipMeta(decodeURIComponent(cityHeader));
  const regionHeader = req.headers.get("cf-region") ?? req.headers.get("cf-region-code");
  if (regionHeader) out.region = clipMeta(decodeURIComponent(regionHeader));
  const postalHeader = req.headers.get("cf-postal-code");
  if (postalHeader) out.postal = clipMeta(postalHeader, 12);

  const ip = clientIp(req);
  if (!ip) return out;
  const encoded = encodeURIComponent(ip);
  const ipwho = await fetchJson(`https://ipwho.is/${encoded}`, 1200);
  if (ipwho && ipwho.success !== false) applyLocality(out, ipwho);
  // Keep fetching if locality or hospital-network org is still incomplete.
  if (
    out.city &&
    out.country &&
    out.latitude != null &&
    out.longitude != null &&
    out.networkOrg
  ) {
    return out;
  }
  const ipapi = await fetchJson(`https://ipapi.co/${encoded}/json/`, 1200);
  if (ipapi && !ipapi.error) applyLocality(out, ipapi);
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const allowed = parseAllowedOrigins();
  const requestOrigin = req.headers.get("origin");
  // sendBeacon often omits Origin. Sandboxed Wix iframes send Origin: null.
  const missingOrOpaque = !requestOrigin || requestOrigin === "null";
  const cors = missingOrOpaque
    ? {
        allowed: req.method === "POST" || req.method === "OPTIONS",
        origin: requestOrigin === "null" ? "null" : (allowed[0] ?? ""),
      }
    : originAllowed(requestOrigin, allowed);
  const echoOrigin = cors.allowed ? cors.origin : (allowed[0] ?? "");

  if (req.method === "OPTIONS") {
    if (!cors.allowed) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(cors.origin) });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, echoOrigin);
  }

  if (!cors.allowed) {
    return json({ error: "Origin not allowed" }, 403, echoOrigin);
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch (err) {
    console.error("record-simbox-event: body read failed", String(err));
    return json({ error: "Invalid request" }, 400, cors.origin);
  }

  const bytes = new TextEncoder().encode(rawText).length;
  if (bytes > MAX_BODY) {
    return json({ error: "payload too large" }, 413, cors.origin);
  }

  let parsed: unknown;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors.origin);
  }

  const validated = validateEventPayload(parsed, bytes);
  if (!validated.ok) {
    return json({ error: "Invalid request" }, validated.status, cors.origin);
  }

  const payload = validated.value;
  const geo = await lookupNetworkLocality(req);
  const clientMeta = { ...payload.metadata };
  for (const key of [
    "city",
    "region",
    "country",
    "postal",
    "timezone",
    "latitude",
    "longitude",
    "county",
    "geoSource",
    "networkOrg",
    "hospitalName",
    "hospitalSource",
    "hospitalFacilityId",
    "hospitalConfidence",
  ]) {
    delete clientMeta[key];
  }
  const metadata: Record<string, unknown> = {
    ...clientMeta,
    ...geo,
  };
  if (geo.city || geo.region || geo.country || geo.postal || geo.latitude != null) {
    metadata.geoSource = "ip";
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("record-simbox-event: missing server configuration");
    return json({ error: "Service unavailable" }, 503, cors.origin);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Prefer an explicit site code mapped in the sites registry.
  const siteKeyRaw = typeof clientMeta.siteKey === "string" ? clientMeta.siteKey.trim() : "";
  if (siteKeyRaw && /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(siteKeyRaw)) {
    const { data: siteRow } = await supabase
      .from("sites")
      .select("display_name")
      .eq("site_key", siteKeyRaw)
      .eq("active", true)
      .maybeSingle();
    if (siteRow?.display_name) {
      metadata.hospitalName = clipMeta(String(siteRow.display_name), 96);
      metadata.hospitalSource = "site_key";
      metadata.hospitalConfidence = "high";
    }
  }

  // Match city / ZIP / network org against the PECC hospital directory.
  if (!metadata.hospitalName) {
    const match = await resolveHospitalDirectory({
      city: typeof geo.city === "string" ? geo.city : "",
      region: typeof geo.region === "string" ? geo.region : "",
      postal: typeof geo.postal === "string" ? geo.postal : "",
      org: typeof geo.networkOrg === "string" ? geo.networkOrg : "",
    });
    if (match?.matched && match.name) {
      metadata.hospitalName = clipMeta(match.name, 96);
      metadata.hospitalSource = clipMeta(match.source || "directory", 32);
      metadata.hospitalConfidence = match.confidence === "high" ? "high" : "medium";
      if (match.facility_id) metadata.hospitalFacilityId = clipMeta(match.facility_id, 32);
    }
  }

  // Last resort: the IP org string itself looks like a hospital, but the directory
  // did not confirm a single facility. Record the name only.
  if (!metadata.hospitalName && typeof geo.networkOrg === "string") {
    const fromOrg = hospitalFromNetworkOrg(String(geo.networkOrg));
    if (fromOrg) {
      metadata.hospitalName = fromOrg;
      metadata.hospitalSource = "keyword";
      metadata.hospitalConfidence = "low";
    }
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id, active, display_name")
    .eq("case_key", payload.case_key)
    .maybeSingle();

  if (caseError) {
    console.error("record-simbox-event: case lookup failed");
    return json({ error: "Service unavailable" }, 503, cors.origin);
  }

  if (!caseRow || caseRow.active !== true) {
    return json({ error: "Case not available" }, 404, cors.origin);
  }

  const { data: suppressed } = await supabase
    .from("suppressed_event_keys")
    .select("event_key")
    .eq("event_key", payload.event_key)
    .maybeSingle();
  if (suppressed) {
    return json({ ok: true, duplicate: true, suppressed: true }, 200, cors.origin);
  }

  const { error: insertError } = await supabase.from("case_events").insert({
    occurred_at: payload.occurred_at,
    event_type: payload.event_type,
    case_id: caseRow.id,
    session_id: payload.session_id,
    event_key: payload.event_key,
    elapsed_seconds: payload.elapsed_seconds,
    delivery_context: payload.delivery_context,
    device_type: payload.device_type,
    app_version: payload.app_version,
    metadata,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return json({ ok: true, duplicate: true }, 200, cors.origin);
    }
    console.error("record-simbox-event: insert failed", insertError.code);
    return json({ error: "Unable to record event" }, 500, cors.origin);
  }

  // Fire-and-forget: PECC Activities when a known hospital finishes a case.
  // Directory guesses that are only medium confidence stay on the analytics dashboard.
  if (payload.event_type === "case_completed") {
    const siteKey =
      typeof metadata.siteKey === "string" ? String(metadata.siteKey).trim() : "";
    const facilityId =
      typeof metadata.hospitalFacilityId === "string"
        ? String(metadata.hospitalFacilityId).trim()
        : "";
    const confidence =
      typeof metadata.hospitalConfidence === "string" ? metadata.hospitalConfidence : "";
    const canNotify = Boolean(siteKey) || (Boolean(facilityId) && confidence === "high");
    if (canNotify) {
      const peccNotify = notifyPeccActivity({
        siteKey: siteKey || undefined,
        facilityId: siteKey ? undefined : facilityId,
        caseKey: payload.case_key,
        caseDisplayName: String(caseRow.display_name || payload.case_key),
        sessionId: payload.session_id,
        occurredAt: payload.occurred_at,
        elapsedSeconds: payload.elapsed_seconds,
      });
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
        .EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(peccNotify);
      else void peccNotify;
    }
  }

  return json({ ok: true, duplicate: false }, 200, cors.origin);
});
