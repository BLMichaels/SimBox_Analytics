import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_IDS = 500;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://simbox-analytics.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function parseAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const extra = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra])];
}

function originAllowed(origin: string | null, allowed: string[]): { allowed: boolean; origin: string } {
  if (!origin) return { allowed: false, origin: "" };
  for (const rule of allowed) {
    if (rule === origin) return { allowed: true, origin };
  }
  return { allowed: false, origin };
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: Record<string, unknown>, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  const allowed = parseAllowedOrigins();
  const requestOrigin = req.headers.get("origin");
  const cors = originAllowed(requestOrigin, allowed);
  const echo = cors.allowed ? cors.origin : (allowed[0] ?? "");

  if (req.method === "OPTIONS") {
    if (!cors.allowed) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(cors.origin) });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, echo);
  }
  if (!cors.allowed) {
    return json({ error: "Origin not allowed" }, 403, echo);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Service unavailable" }, 503, cors.origin);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return json({ error: "Not authorized" }, 401, cors.origin);
  }

  const asUser = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser(token);
  if (userError || !userData.user) {
    return json({ error: "Not authorized" }, 401, cors.origin);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminRow } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!adminRow) {
    return json({ error: "Not authorized" }, 403, cors.origin);
  }

  let parsed: { ids?: unknown };
  try {
    parsed = (await req.json()) as { ids?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors.origin);
  }

  if (!Array.isArray(parsed.ids) || parsed.ids.length === 0 || parsed.ids.length > MAX_IDS) {
    return json({ error: "Invalid request" }, 400, cors.origin);
  }
  const ids: string[] = [];
  for (const value of parsed.ids) {
    if (typeof value !== "string" || !UUID_RE.test(value)) {
      return json({ error: "Invalid request" }, 400, cors.origin);
    }
    ids.push(value);
  }

  const { error: delError, count } = await admin
    .from("case_events")
    .delete({ count: "exact" })
    .in("id", ids);
  if (delError) {
    return json({ error: "Unable to delete" }, 500, cors.origin);
  }

  return json({ ok: true, deleted: count ?? ids.length }, 200, cors.origin);
});
