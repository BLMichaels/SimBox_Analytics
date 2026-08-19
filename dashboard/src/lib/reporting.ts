import { formatDuration, formatLocal } from "./dates";
import type { CaseEventRecord } from "./types";

export function metaString(row: CaseEventRecord, key: string): string {
  const v = row.metadata?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

export function metaNumber(row: CaseEventRecord, key: string): number | null {
  const v = row.metadata?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function eventLabel(type: string): string {
  switch (type) {
    case "case_started":
      return "Started";
    case "case_checkpoint":
      return "Step reached";
    case "case_completed":
      return "Completed";
    case "case_exited":
      return "Exited";
    default:
      return type.replace("case_", "");
  }
}

export function accessLabel(value: string | null | undefined): string {
  if (value === "wix_embedded") return "Wix embed";
  if (value === "github_direct") return "GitHub Pages";
  return value || "Unknown";
}

export type Locality = {
  city: string;
  region: string;
  county: string;
  postal: string;
  country: string;
  timezone: string;
  siteKey: string;
  latitude: number | null;
  longitude: number | null;
};

export function localityOf(row: CaseEventRecord): Locality {
  return {
    city: metaString(row, "city"),
    region: metaString(row, "region"),
    county: metaString(row, "county"),
    postal: metaString(row, "postal"),
    country: metaString(row, "country"),
    timezone: metaString(row, "timezone"),
    siteKey: metaString(row, "siteKey"),
    latitude: metaNumber(row, "latitude"),
    longitude: metaNumber(row, "longitude"),
  };
}

export function locationLine(row: CaseEventRecord): string {
  const loc = localityOf(row);
  const parts = [loc.city, loc.region, loc.postal, loc.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Not resolved";
}

export function dash(value: string): string {
  return value.trim() ? value : "—";
}

export function siteLine(row: CaseEventRecord): string {
  return metaString(row, "siteKey") || "Not provided";
}

export function stepLine(row: CaseEventRecord): string {
  const title = metaString(row, "slideTitle") || metaString(row, "lastSlide");
  const step = metaNumber(row, "step") ?? metaNumber(row, "lastStep");
  if (title && step != null) return `${title}`;
  if (title) return title;
  if (step != null) return `Step ${step}`;
  return "—";
}

export type SessionSummary = {
  session_id: string;
  case_name: string;
  case_key: string;
  started_at: string;
  ended_at: string;
  outcome: "completed" | "exited" | "in_progress";
  event_count: number;
  checkpoint_count: number;
  elapsed_seconds: number | null;
  last_step: string;
  location: string;
  city: string;
  region: string;
  county: string;
  postal: string;
  country: string;
  timezone: string;
  site: string;
  access: string;
  device: string;
  environment: string;
  latitude: number | null;
  longitude: number | null;
  events: CaseEventRecord[];
};

export type CountRow = { label: string; n: number; pct: number };

export function tally(
  items: SessionSummary[],
  keyFn: (s: SessionSummary) => string,
  emptyLabel = "Not resolved",
): CountRow[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const raw = keyFn(item).trim();
    const key = raw || emptyLabel;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const total = items.length || 1;
  return [...map.entries()]
    .map(([label, n]) => ({ label, n, pct: n / total }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

export type TimelineStep = {
  index: number;
  event: CaseEventRecord;
  deltaSec: number;
};

export function sessionTimeline(events: CaseEventRecord[]): TimelineStep[] {
  const ordered = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return ordered.map((event, index) => {
    const prev = ordered[index - 1];
    const deltaMs = prev ? Date.parse(event.occurred_at) - Date.parse(prev.occurred_at) : 0;
    return {
      index,
      event,
      deltaSec: Number.isFinite(deltaMs) ? Math.max(0, Math.round(deltaMs / 1000)) : 0,
    };
  });
}

export function summarizeSessions(rows: CaseEventRecord[]): SessionSummary[] {
  const groups = new Map<string, CaseEventRecord[]>();
  for (const row of rows) {
    const list = groups.get(row.session_id) ?? [];
    list.push(row);
    groups.set(row.session_id, list);
  }
  const out: SessionSummary[] = [];
  for (const [session_id, events] of groups) {
    const ordered = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last) continue;
    const completed = ordered.some((e) => e.event_type === "case_completed");
    const exited = ordered.some((e) => e.event_type === "case_exited");
    const locSource = [...ordered].reverse().find((e) => locationLine(e) !== "Not resolved") ?? last;
    const siteSource = [...ordered].reverse().find((e) => metaString(e, "siteKey")) ?? last;
    const coordSource =
      [...ordered].reverse().find((e) => localityOf(e).latitude != null && localityOf(e).longitude != null) ??
      locSource;
    const loc = localityOf(locSource);
    const coords = localityOf(coordSource);
    const completedEvent = [...ordered].reverse().find((e) => e.event_type === "case_completed");
    const elapsed =
      completedEvent?.elapsed_seconds ??
      last.elapsed_seconds ??
      null;
    out.push({
      session_id,
      case_name: first.cases?.display_name ?? last.cases?.display_name ?? "—",
      case_key: first.cases?.case_key ?? last.cases?.case_key ?? "",
      started_at: first.occurred_at,
      ended_at: last.occurred_at,
      outcome: completed ? "completed" : exited ? "exited" : "in_progress",
      event_count: ordered.length,
      checkpoint_count: ordered.filter((e) => e.event_type === "case_checkpoint").length,
      elapsed_seconds: elapsed,
      last_step: stepLine(last),
      location: locationLine(locSource),
      city: loc.city,
      region: loc.region,
      county: loc.county,
      postal: loc.postal,
      country: loc.country,
      timezone: loc.timezone,
      site: siteLine(siteSource),
      access: accessLabel(first.delivery_context),
      device: first.device_type ?? "unknown",
      environment: metaString(first, "environment") || "production",
      latitude: coords.latitude,
      longitude: coords.longitude,
      events: ordered,
    });
  }
  return out.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function outcomeLabel(outcome: SessionSummary["outcome"]): string {
  if (outcome === "completed") return "Completed";
  if (outcome === "exited") return "Exited before complete";
  return "In progress";
}

export function firstEvent(
  events: CaseEventRecord[],
  type: CaseEventRecord["event_type"],
): CaseEventRecord | undefined {
  return events.find((e) => e.event_type === type);
}

export function eventStamp(events: CaseEventRecord[], type: CaseEventRecord["event_type"]): string {
  const hit = firstEvent(events, type);
  return hit ? formatLocal(hit.occurred_at) : "";
}

export function stepStamp(events: CaseEventRecord[], label: string): string {
  const hit = events.find((e) => stepLine(e) === label);
  return hit ? formatLocal(hit.occurred_at) : "";
}

export function progressionLine(session: SessionSummary): string {
  return session.events
    .map((e) => (e.event_type === "case_checkpoint" ? stepLine(e) : eventLabel(e.event_type)))
    .filter((label) => label && label !== "—")
    .join(" → ");
}

function stepSortKey(label: string): [number, string] {
  const match = /(\d+)/.exec(label);
  const n = match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  return [Number.isFinite(n) ? n : Number.POSITIVE_INFINITY, label];
}

export function unionStepLabels(sessions: SessionSummary[]): string[] {
  const seen = new Set<string>();
  for (const session of sessions) {
    for (const event of session.events) {
      if (event.event_type !== "case_checkpoint" && event.event_type !== "case_started") continue;
      const label = stepLine(event);
      if (label && label !== "—") seen.add(label);
    }
  }
  return [...seen].sort((a, b) => {
    const [an, as] = stepSortKey(a);
    const [bn, bs] = stepSortKey(b);
    if (an !== bn) return an - bn;
    return as.localeCompare(bs);
  });
}

export function sessionWideCsvRow(
  s: SessionSummary,
  stepLabels: string[],
): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = {
    ...sessionCsvRow(s),
    progression: progressionLine(s),
    started_event: eventStamp(s.events, "case_started"),
    completed_event: eventStamp(s.events, "case_completed"),
    exited_event: eventStamp(s.events, "case_exited"),
  };
  for (const label of stepLabels) {
    row[label] = stepStamp(s.events, label);
  }
  return row;
}

export function sessionCsvRow(s: SessionSummary): Record<string, string | number | null> {
  return {
    session_id: s.session_id,
    case_name: s.case_name,
    case_key: s.case_key,
    started_local: formatLocal(s.started_at),
    started_utc: s.started_at,
    ended_utc: s.ended_at,
    outcome: s.outcome,
    event_count: s.event_count,
    checkpoint_count: s.checkpoint_count,
    elapsed_seconds: s.elapsed_seconds,
    last_step: s.last_step,
    location: s.location,
    city: s.city,
    region: s.region,
    postal: s.postal,
    country: s.country,
    timezone: s.timezone,
    latitude: s.latitude,
    longitude: s.longitude,
    site_code: s.site === "Not provided" ? "" : s.site,
    access: s.access,
    device: s.device,
    environment: s.environment,
  };
}

export function eventCsvRow(
  r: CaseEventRecord,
  extra?: { sequence?: number; seconds_since_previous?: number },
): Record<string, string | number | null> {
  return {
    sequence: extra?.sequence ?? "",
    local_timestamp: formatLocal(r.occurred_at),
    utc_timestamp: r.occurred_at,
    case_name: r.cases?.display_name ?? "",
    case_key: r.cases?.case_key ?? "",
    event: r.event_type,
    session_id: r.session_id,
    elapsed_seconds: r.elapsed_seconds,
    seconds_since_previous: extra?.seconds_since_previous ?? "",
    step: stepLine(r),
    slide_id: metaString(r, "slideId"),
    access: accessLabel(r.delivery_context),
    device: r.device_type,
    city: metaString(r, "city"),
    region: metaString(r, "region"),
    country: metaString(r, "country"),
    postal: metaString(r, "postal"),
    timezone: metaString(r, "timezone"),
    site_code: metaString(r, "siteKey"),
    environment: metaString(r, "environment") || "production",
  };
}

export { formatDuration };
