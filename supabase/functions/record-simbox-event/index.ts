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
      if (new RegExp(`^${escaped}$`).test(origin)) {
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

Deno.serve(async (req: Request): Promise<Response> => {
  const allowed = parseAllowedOrigins();
  const requestOrigin = req.headers.get("origin");
  // sendBeacon often omits Origin; still accept a validated POST.
  const cors = requestOrigin
    ? originAllowed(requestOrigin, allowed)
    : { allowed: req.method === "POST", origin: allowed[0] ?? "" };
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
    metadata: payload.metadata,
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
