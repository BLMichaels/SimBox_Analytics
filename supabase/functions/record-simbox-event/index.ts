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
}

function asCoord(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 1000) / 1000;
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
  if (out.city && out.country && out.latitude != null && out.longitude != null) return out;
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
  for (const key of ["city", "region", "country", "postal", "timezone", "latitude", "longitude", "county", "geoSource"]) {
    delete clientMeta[key];
  }
  const metadata = {
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

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id, active")
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

  return json({ ok: true, duplicate: false }, 200, cors.origin);
});
