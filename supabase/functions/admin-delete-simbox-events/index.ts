import { json, requireDashboardAdmin } from "../_shared/adminHttp.ts";

const MAX_IDS = 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  const gate = await requireDashboardAdmin(req);
  if (!gate.ok) return gate.response;
  const origin = req.headers.get("origin") || "https://simbox-analytics.vercel.app";

  let parsed: { ids?: unknown };
  try {
    parsed = (await req.json()) as { ids?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  if (!Array.isArray(parsed.ids) || parsed.ids.length === 0 || parsed.ids.length > MAX_IDS) {
    return json({ error: "Invalid request" }, 400, origin);
  }
  const ids: string[] = [];
  for (const value of parsed.ids) {
    if (typeof value !== "string" || !UUID_RE.test(value)) {
      return json({ error: "Invalid request" }, 400, origin);
    }
    ids.push(value);
  }

  const { data: existing, error: readError } = await gate.admin
    .from("case_events")
    .select("id, event_key")
    .in("id", ids);
  if (readError) {
    return json({ error: "Unable to delete" }, 500, origin);
  }

  const keys = [...new Set((existing ?? []).map((row) => String(row.event_key)).filter(Boolean))];
  if (keys.length) {
    const { error: suppressError } = await gate.admin
      .from("suppressed_event_keys")
      .upsert(
        keys.map((event_key) => ({ event_key })),
        { onConflict: "event_key" },
      );
    if (suppressError) {
      return json({ error: "Unable to delete" }, 500, origin);
    }
  }

  const { error: delError, count } = await gate.admin
    .from("case_events")
    .delete({ count: "exact" })
    .in("id", ids);
  if (delError) {
    return json({ error: "Unable to delete" }, 500, origin);
  }

  return json(
    { ok: true, deleted: count ?? (existing ?? []).length, suppressed: keys.length },
    200,
    origin,
  );
});
