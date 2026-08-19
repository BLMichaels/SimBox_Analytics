import { supabase } from "./supabase";
import type { CaseEventRecord, DeliveryContext, DeviceType, EventType } from "./types";

const PAGE_CHUNK = 1000;
const MAX_ROWS = 8000;

export type EventQuery = {
  from: Date;
  to: Date;
  caseIds?: string[];
  eventTypes?: EventType[];
  deliveryContexts?: DeliveryContext[];
  deviceTypes?: DeviceType[];
  sessionId?: string;
};

export async function fetchCaseEvents(
  query: EventQuery,
): Promise<{ rows: CaseEventRecord[]; error: string | null }> {
  const collected: CaseEventRecord[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_CHUNK) {
    let q = supabase
      .from("case_events")
      .select("*, cases(case_key, display_name, active)")
      .order("occurred_at", { ascending: Boolean(query.sessionId) })
      .range(from, from + PAGE_CHUNK - 1);
    if (query.sessionId) {
      q = q.eq("session_id", query.sessionId);
    } else {
      q = q
        .gte("occurred_at", query.from.toISOString())
        .lt("occurred_at", new Date(query.to.getTime() + 1).toISOString());
    }
    if (query.caseIds?.length) q = q.in("case_id", query.caseIds);
    if (query.eventTypes?.length) q = q.in("event_type", query.eventTypes);
    if (query.deliveryContexts?.length) q = q.in("delivery_context", query.deliveryContexts);
    if (query.deviceTypes?.length) q = q.in("device_type", query.deviceTypes);
    const { data, error } = await q;
    if (error) return { rows: [], error: "Unable to load events." };
    const batch = (data ?? []) as CaseEventRecord[];
    collected.push(...batch);
    if (batch.length < PAGE_CHUNK) break;
  }
  return { rows: collected, error: null };
}

export function applyClientFilters(
  rows: CaseEventRecord[],
  opts: { includeNonProduction: boolean; search: string },
): CaseEventRecord[] {
  let next = rows;
  if (!opts.includeNonProduction) {
    next = next.filter((r) => (r.metadata?.environment ?? "production") === "production");
  }
  const s = opts.search.trim().toLowerCase();
  if (!s) return next;
  return next.filter((r) => {
    const name = r.cases?.display_name ?? "";
    const key = r.cases?.case_key ?? "";
    const city = String(r.metadata?.city ?? "");
    const region = String(r.metadata?.region ?? "");
    const postal = String(r.metadata?.postal ?? "");
    const site = String(r.metadata?.siteKey ?? "");
    return (
      name.toLowerCase().includes(s) ||
      key.toLowerCase().includes(s) ||
      r.session_id.toLowerCase().includes(s) ||
      city.toLowerCase().includes(s) ||
      region.toLowerCase().includes(s) ||
      postal.toLowerCase().includes(s) ||
      site.toLowerCase().includes(s)
    );
  });
}
