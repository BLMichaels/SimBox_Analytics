import { supabase } from "./supabase";
import type { CaseEventRecord, DeliveryContext, DeviceType, EventType } from "./types";

const PAGE_CHUNK = 1000;
export const MAX_EVENT_ROWS = 40000;

export type EventQuery = {
  from: Date;
  to: Date;
  caseIds?: string[];
  eventTypes?: EventType[];
  deliveryContexts?: DeliveryContext[];
  deviceTypes?: DeviceType[];
  sessionId?: string;
};

export type EventFetchResult = {
  rows: CaseEventRecord[];
  error: string | null;
  truncated: boolean;
  fetched: number;
  total: number | null;
};

export async function fetchCaseEvents(query: EventQuery): Promise<EventFetchResult> {
  const empty: EventFetchResult = { rows: [], error: null, truncated: false, fetched: 0, total: 0 };
  let countQuery = supabase.from("case_events").select("id", { count: "exact", head: true });
  if (query.sessionId) {
    countQuery = countQuery.eq("session_id", query.sessionId);
  } else {
    countQuery = countQuery
      .gte("occurred_at", query.from.toISOString())
      .lt("occurred_at", new Date(query.to.getTime() + 1).toISOString());
  }
  if (query.caseIds?.length) countQuery = countQuery.in("case_id", query.caseIds);
  if (query.eventTypes?.length) countQuery = countQuery.in("event_type", query.eventTypes);
  if (query.deliveryContexts?.length) countQuery = countQuery.in("delivery_context", query.deliveryContexts);
  if (query.deviceTypes?.length) countQuery = countQuery.in("device_type", query.deviceTypes);
  const counted = await countQuery;
  const total = typeof counted.count === "number" ? counted.count : null;

  const collected: CaseEventRecord[] = [];
  for (let from = 0; from < MAX_EVENT_ROWS; from += PAGE_CHUNK) {
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
    if (error) return { ...empty, error: "Unable to load events.", total };
    const batch = (data ?? []) as CaseEventRecord[];
    collected.push(...batch);
    if (batch.length < PAGE_CHUNK) break;
  }
  const truncated = total != null ? collected.length < total : collected.length >= MAX_EVENT_ROWS;
  return { rows: collected, error: null, truncated, fetched: collected.length, total };
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
