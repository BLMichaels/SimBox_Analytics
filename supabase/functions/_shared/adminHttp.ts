import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const ADMIN_ALLOWED_ORIGINS = [
  "https://simbox-analytics.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function parseAdminOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const extra = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...ADMIN_ALLOWED_ORIGINS, ...extra])];
}

export function originAllowed(
  origin: string | null,
  allowed: string[],
): { allowed: boolean; origin: string } {
  if (!origin) return { allowed: false, origin: "" };
  for (const rule of allowed) {
    if (rule === origin) return { allowed: true, origin };
    if (rule.includes("*")) {
      const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
      if (new RegExp(`^${escaped}$`).test(origin)) return { allowed: true, origin };
    }
  }
  return { allowed: false, origin };
}

export function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(
  body: Record<string, unknown>,
  status: number,
  origin: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function requireDashboardAdmin(
  req: Request,
): Promise<
  | { ok: true; userId: string; email: string | null; admin: SupabaseClient }
  | { ok: false; response: Response }
> {
  const allowed = parseAdminOrigins();
  const requestOrigin = req.headers.get("origin");
  const cors = originAllowed(requestOrigin, allowed);
  const echo = cors.allowed ? cors.origin : (allowed[0] ?? "");

  if (req.method === "OPTIONS") {
    if (!cors.allowed) return { ok: false, response: new Response(null, { status: 403 }) };
    return {
      ok: false,
      response: new Response(null, { status: 204, headers: corsHeaders(cors.origin) }),
    };
  }

  if (req.method !== "POST") {
    return { ok: false, response: json({ error: "Method not allowed" }, 405, echo) };
  }
  if (!cors.allowed) {
    return { ok: false, response: json({ error: "Origin not allowed" }, 403, echo) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, response: json({ error: "Service unavailable" }, 503, cors.origin) };
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return { ok: false, response: json({ error: "Not authorized" }, 401, cors.origin) };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false, response: json({ error: "Not authorized" }, 401, cors.origin) };
  }

  const { data: adminRow } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!adminRow) {
    return { ok: false, response: json({ error: "Not authorized" }, 403, cors.origin) };
  }

  return {
    ok: true,
    userId: userData.user.id,
    email: userData.user.email ?? null,
    admin,
  };
}

export function dashboardOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin && originAllowed(origin, parseAdminOrigins()).allowed) return origin;
  return "https://simbox-analytics.vercel.app";
}
