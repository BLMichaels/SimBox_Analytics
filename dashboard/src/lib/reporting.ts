import { formatDuration, formatLocal } from "./dates";
import type { CaseEventRecord, DashboardMetrics } from "./types";

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
  app_version: string;
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
      app_version: first.app_version || last.app_version || "",
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
    app_version: s.app_version,
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

export type DurationMode = "all" | "completed" | "exited";

export function durationBuckets(
  sessions: SessionSummary[],
  mode: DurationMode = "all",
): CountRow[] {
  const scoped =
    mode === "completed"
      ? sessions.filter((s) => s.outcome === "completed")
      : mode === "exited"
        ? sessions.filter((s) => s.outcome === "exited")
        : sessions;
  const timed = scoped.map((s) => sessionWallSeconds(s)).filter((s) => s > 0);
  const bins = [
    { label: "Under 2 min", test: (s: number) => s < 120 },
    { label: "2–5 min", test: (s: number) => s >= 120 && s < 300 },
    { label: "5–10 min", test: (s: number) => s >= 300 && s < 600 },
    { label: "10–20 min", test: (s: number) => s >= 600 && s < 1200 },
    { label: "20 min or more", test: (s: number) => s >= 1200 },
  ];
  const total = timed.length || 1;
  return bins.map((bin) => {
    const n = timed.filter((s) => bin.test(s)).length;
    return { label: bin.label, n, pct: n / total };
  });
}

/** Local weekday (0=Sun) and hour in the session's IP-resolved timezone. */
export function sessionLocalClock(
  startedAt: string,
  timeZone: string | null | undefined,
): { weekday: number; hour: number; source: "session" | "utc" } {
  const d = new Date(startedAt);
  const tz = timeZone?.trim();
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "short",
        hour: "numeric",
        hourCycle: "h23",
      }).formatToParts(d);
      const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
      const hourRaw = parts.find((p) => p.type === "hour")?.value;
      const weekdayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      const weekday = weekdayMap[wd];
      const hour = hourRaw != null ? Number(hourRaw) : Number.NaN;
      if (weekday != null && Number.isFinite(hour)) {
        return { weekday, hour, source: "session" };
      }
    } catch {
      /* invalid IANA zone */
    }
  }
  return { weekday: d.getUTCDay(), hour: d.getUTCHours(), source: "utc" };
}

export function weekdayMix(sessions: SessionSummary[]): CountRow[] {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const counts = names.map((label) => ({ label, n: 0, pct: 0 }));
  for (const session of sessions) {
    const { weekday } = sessionLocalClock(session.started_at, session.timezone);
    const row = counts[weekday];
    if (row) row.n += 1;
  }
  const total = sessions.length || 1;
  return counts.map((row) => ({ ...row, pct: row.n / total }));
}

export function hourMix(sessions: SessionSummary[]): CountRow[] {
  const bins = [
    { label: "Night (12–5)", test: (h: number) => h < 6 },
    { label: "Morning (6–11)", test: (h: number) => h >= 6 && h < 12 },
    { label: "Afternoon (12–17)", test: (h: number) => h >= 12 && h < 18 },
    { label: "Evening (18–23)", test: (h: number) => h >= 18 },
  ];
  const total = sessions.length || 1;
  return bins.map((bin) => {
    const n = sessions.filter((s) => {
      const { hour } = sessionLocalClock(s.started_at, s.timezone);
      return bin.test(hour);
    }).length;
    return { label: bin.label, n, pct: n / total };
  });
}

export function sessionsWithTimezone(sessions: SessionSummary[]): number {
  return sessions.filter((s) => {
    const tz = s.timezone?.trim();
    if (!tz) return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }).length;
}

/** Highest numbered step seen for each case in this extract (from checkpoints/complete). */
export function caseMaxSteps(sessions: SessionSummary[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of sessions) {
    let max = map.get(session.case_key) ?? 0;
    for (const event of session.events) {
      if (
        event.event_type !== "case_checkpoint" &&
        event.event_type !== "case_completed" &&
        event.event_type !== "case_started"
      ) {
        continue;
      }
      const numbered = metaNumber(event, "step") ?? metaNumber(event, "lastStep");
      if (numbered != null && Number.isFinite(numbered)) max = Math.max(max, numbered);
      const [fromLabel] = stepSortKey(stepLine(event));
      if (Number.isFinite(fromLabel) && fromLabel < Number.POSITIVE_INFINITY) {
        max = Math.max(max, fromLabel);
      }
    }
    map.set(session.case_key, max);
  }
  return map;
}

export function filterSessionsByCaseMaxSteps(
  sessions: SessionSummary[],
  maxSteps: number | null,
): SessionSummary[] {
  if (maxSteps == null || maxSteps <= 0) return sessions;
  const depths = caseMaxSteps(sessions);
  return sessions.filter((s) => {
    const depth = depths.get(s.case_key) ?? 0;
    // Unknown depth (no numbered steps yet) stays in "All" only.
    return depth > 0 && depth <= maxSteps;
  });
}

export function funnelStepOptions(sessions: SessionSummary[]): number[] {
  const depths = [...caseMaxSteps(sessions).values()].filter((n) => n > 0);
  if (!depths.length) return [];
  const max = Math.max(...depths);
  const opts: number[] = [];
  for (let n = 3; n <= Math.max(3, max); n++) {
    if (depths.some((d) => d <= n)) opts.push(n);
  }
  return opts;
}

/**
 * Progression funnel. When maxCaseSteps is set, only sessions from cases whose
 * observed step count is ≤ that value are included — so a 3-step case is not
 * judged against Step 6 from a longer case.
 */
export function funnelFromSessions(
  sessions: SessionSummary[],
  maxCaseSteps: number | null = null,
): CountRow[] {
  const scoped = filterSessionsByCaseMaxSteps(sessions, maxCaseSteps);
  const started = scoped.length;
  const denom = started || 1;
  const labels = unionStepLabels(scoped).filter((label) => !/^started$/i.test(label));
  const rows: CountRow[] = [{ label: "Started", n: started, pct: started / denom }];
  const seen = new Set<string>(["started"]);
  for (const label of labels) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const n = scoped.filter((s) => s.events.some((e) => stepLine(e) === label)).length;
    rows.push({ label, n, pct: n / denom });
  }
  const completed = scoped.filter((s) => s.outcome === "completed").length;
  if (!seen.has("completed")) {
    rows.push({ label: "Completed", n: completed, pct: completed / denom });
  }
  return rows;
}

export function outcomeMix(sessions: SessionSummary[]): CountRow[] {
  return tally(sessions, (s) => outcomeLabel(s.outcome));
}

/** Wall-clock or reported elapsed seconds for a session (start → last action). */
export function sessionWallSeconds(s: SessionSummary): number {
  if (s.elapsed_seconds != null && Number.isFinite(s.elapsed_seconds)) {
    return Math.max(0, s.elapsed_seconds);
  }
  const ms = Date.parse(s.ended_at) - Date.parse(s.started_at);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
}

export function filterSessionsByMinDuration(
  sessions: SessionSummary[],
  minSeconds: number,
): SessionSummary[] {
  if (!minSeconds || minSeconds <= 0) return sessions;
  return sessions.filter((s) => sessionWallSeconds(s) >= minSeconds);
}

export function filterEventsBySessions(
  events: CaseEventRecord[],
  sessions: SessionSummary[],
): CaseEventRecord[] {
  const ids = new Set(sessions.map((s) => s.session_id));
  return events.filter((e) => ids.has(e.session_id));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function kpisFromSessions(sessions: SessionSummary[]): {
  starts: number;
  completions: number;
  exits: number;
  unique_sessions: number;
  active_cases: number;
  avg_completion_seconds: number | null;
  median_completion_seconds: number | null;
} {
  const starts = sessions.length;
  const completions = sessions.filter((s) => s.outcome === "completed").length;
  const exits = sessions.filter((s) => s.outcome === "exited").length;
  const caseKeys = new Set(sessions.map((s) => s.case_key));
  const completedDurations = sessions
    .filter((s) => s.outcome === "completed")
    .map((s) => sessionWallSeconds(s));
  const sum = completedDurations.reduce((a, b) => a + b, 0);
  return {
    starts,
    completions,
    exits,
    unique_sessions: starts,
    active_cases: caseKeys.size,
    avg_completion_seconds: completedDurations.length ? sum / completedDurations.length : null,
    median_completion_seconds: median(completedDurations),
  };
}

export function dailyFromSessions(sessions: SessionSummary[]): Array<{
  day_utc: string;
  starts: number;
  completions: number;
}> {
  const map = new Map<string, { starts: number; completions: number }>();
  for (const s of sessions) {
    const day = `${s.started_at.slice(0, 10)}T00:00:00.000Z`;
    const cur = map.get(day) ?? { starts: 0, completions: 0 };
    cur.starts += 1;
    if (s.outcome === "completed") cur.completions += 1;
    map.set(day, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day_utc, v]) => ({ day_utc, starts: v.starts, completions: v.completions }));
}

export function byCaseFromSessions(sessions: SessionSummary[]): Array<{
  id: string;
  case_key: string;
  display_name: string;
  starts: number;
  completions: number;
  completion_rate: number;
}> {
  const map = new Map<
    string,
    { case_key: string; display_name: string; starts: number; completions: number }
  >();
  for (const s of sessions) {
    const cur = map.get(s.case_key) ?? {
      case_key: s.case_key,
      display_name: s.case_name,
      starts: 0,
      completions: 0,
    };
    cur.starts += 1;
    if (s.outcome === "completed") cur.completions += 1;
    map.set(s.case_key, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.starts - a.starts)
    .map((c) => ({
      id: c.case_key,
      case_key: c.case_key,
      display_name: c.display_name,
      starts: c.starts,
      completions: c.completions,
      completion_rate: c.starts ? c.completions / c.starts : 0,
    }));
}

export function metricsFromSessions(sessions: SessionSummary[]): DashboardMetrics {
  const funnel = funnelFromSessions(sessions);
  return {
    kpis: kpisFromSessions(sessions),
    daily: dailyFromSessions(sessions),
    by_case: byCaseFromSessions(sessions),
    by_delivery: tally(sessions, (s) => s.access, "Unknown").map((r) => ({ key: r.label, n: r.n })),
    by_device: tally(sessions, (s) => s.device, "unknown").map((r) => ({ key: r.label, n: r.n })),
    by_step: funnel
      .filter((r) => r.label !== "Started")
      .map((r, i) => ({ step: i + 1, label: r.label, sessions: r.n })),
  };
}

export type StepDwell = {
  label: string;
  reached: number;
  avgSeconds: number | null;
  medianSeconds: number | null;
  dropoff: number;
  pct: number;
};

export function timeOnStep(sessions: SessionSummary[]): StepDwell[] {
  const labels = unionStepLabels(sessions).filter((label) => !/^started$/i.test(label));
  const denom = sessions.length || 1;
  return labels.map((label) => {
    const dwells: number[] = [];
    let reached = 0;
    let dropoff = 0;
    for (const session of sessions) {
      const timeline = sessionTimeline(session.events);
      const hit = timeline.find((step) => stepLine(step.event) === label);
      if (!hit) continue;
      reached += 1;
      const next = timeline[hit.index + 1];
      if (next) dwells.push(next.deltaSec);
      const isLastMeaningful =
        session.last_step === label && session.outcome !== "completed";
      if (isLastMeaningful) dropoff += 1;
    }
    return {
      label,
      reached,
      avgSeconds: dwells.length ? dwells.reduce((a, b) => a + b, 0) / dwells.length : null,
      medianSeconds: median(dwells),
      dropoff,
      pct: reached / denom,
    };
  });
}

export type TrackingHealth = {
  case_key: string;
  display_name: string;
  sessions: number;
  withCheckpoints: number;
  checkpointRate: number;
  locatable: number;
  locatableRate: number;
  lastStarted: string | null;
  status: "ok" | "sparse" | "silent";
};

export function trackingHealth(sessions: SessionSummary[], caseKey?: string): TrackingHealth[] {
  const grouped = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    if (caseKey && s.case_key !== caseKey) continue;
    const list = grouped.get(s.case_key) ?? [];
    list.push(s);
    grouped.set(s.case_key, list);
  }
  return [...grouped.entries()]
    .map(([key, list]) => {
      const withCheckpoints = list.filter((s) => s.checkpoint_count > 0).length;
      const locatable = list.filter((s) => s.location !== "Not resolved").length;
      const checkpointRate = list.length ? withCheckpoints / list.length : 0;
      const locatableRate = list.length ? locatable / list.length : 0;
      let status: TrackingHealth["status"] = "ok";
      if (list.length === 0) status = "silent";
      else if (checkpointRate < 0.25 || locatableRate < 0.3) status = "sparse";
      return {
        case_key: key,
        display_name: list[0]?.case_name ?? key,
        sessions: list.length,
        withCheckpoints,
        checkpointRate,
        locatable,
        locatableRate,
        lastStarted: list[0]?.started_at ?? null,
        status,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

export type SiteCohort = {
  label: string;
  starts: number;
  completions: number;
  completion_rate: number;
  median_seconds: number | null;
  with_checkpoints: number;
  pct: number;
};

export function siteCohorts(sessions: SessionSummary[]): SiteCohort[] {
  const map = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const key = s.site === "Not provided" || !s.site.trim() ? "No site code" : s.site;
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  const total = sessions.length || 1;
  return [...map.entries()]
    .map(([label, list]) => {
      const completions = list.filter((s) => s.outcome === "completed").length;
      return {
        label,
        starts: list.length,
        completions,
        completion_rate: list.length ? completions / list.length : 0,
        median_seconds: median(list.filter((s) => s.outcome === "completed").map(sessionWallSeconds)),
        with_checkpoints: list.filter((s) => s.checkpoint_count > 0).length,
        pct: list.length / total,
      };
    })
    .sort((a, b) => b.starts - a.starts);
}

export function versionMix(sessions: SessionSummary[]): CountRow[] {
  return tally(sessions, (s) => s.app_version || "Unspecified", "Unspecified");
}

export type KpiDelta = {
  starts: number;
  completions: number;
  rate: number;
  priorStarts: number;
  priorCompletions: number;
  priorRate: number;
  startsDelta: number;
  rateDelta: number;
};

export function compareKpis(current: SessionSummary[], prior: SessionSummary[]): KpiDelta {
  const a = kpisFromSessions(current);
  const b = kpisFromSessions(prior);
  const rate = a.starts ? a.completions / a.starts : 0;
  const priorRate = b.starts ? b.completions / b.starts : 0;
  return {
    starts: a.starts,
    completions: a.completions,
    rate,
    priorStarts: b.starts,
    priorCompletions: b.completions,
    priorRate,
    startsDelta: a.starts - b.starts,
    rateDelta: rate - priorRate,
  };
}

export function studyBrief(opts: {
  rangeLabel: string;
  sessions: SessionSummary[];
  rawCount: number;
  minSessionSeconds: number;
  truncated: boolean;
  fetched: number;
  total: number | null;
}): string {
  const { sessions, rawCount, minSessionSeconds, rangeLabel, truncated, fetched, total } = opts;
  if (!sessions.length) {
    if (rawCount > 0 && minSessionSeconds > 0) {
      return `In ${rangeLabel}, all ${rawCount} session${rawCount === 1 ? "" : "s"} were shorter than ${Math.round(minSessionSeconds / 60)} minutes. Lower the minimum length to include quick previews.`;
    }
    return `No anonymous sessions match the current study filters for ${rangeLabel}.`;
  }
  const kpis = kpisFromSessions(sessions);
  const rate = kpis.starts ? kpis.completions / kpis.starts : 0;
  const topPlace = tally(sessions, (s) => s.location).find((r) => r.label !== "Not resolved");
  const unresolved = sessions.filter((s) => s.location === "Not resolved").length;
  const sites = siteCohorts(sessions).filter((s) => s.label !== "No site code");
  const health = trackingHealth(sessions);
  const sparse = health.filter((h) => h.status === "sparse").length;
  const parts = [
    `In ${rangeLabel}, ${kpis.starts} session${kpis.starts === 1 ? "" : "s"}`,
    minSessionSeconds > 0
      ? ` lasting at least ${Math.round(minSessionSeconds / 60)} minutes (${rawCount - kpis.starts} shorter run${rawCount - kpis.starts === 1 ? "" : "s"} hidden)`
      : "",
    `. Completion rate ${Math.round(rate * 1000) / 10}% (${kpis.completions} completed)`,
    kpis.median_completion_seconds != null
      ? `, median completed duration ${formatDuration(kpis.median_completion_seconds)}`
      : "",
    `.`,
  ];
  if (topPlace) parts.push(` Most activity: ${topPlace.label} (${topPlace.n}).`);
  if (unresolved) parts.push(` ${unresolved} session${unresolved === 1 ? "" : "s"} without locatable city/region.`);
  if (sites.length) parts.push(` ${sites.length} site code${sites.length === 1 ? "" : "s"} in this extract.`);
  if (sparse) parts.push(` ${sparse} case${sparse === 1 ? "" : "s"} have sparse checkpoint or locality coverage.`);
  if (truncated) {
    parts.push(
      ` Extract is truncated (${fetched.toLocaleString()} of ${total?.toLocaleString() ?? "many"} events). Narrow the study period.`,
    );
  }
  return parts.join("");
}

export function studyPacketText(opts: {
  exportedAt: string;
  exporter: string;
  rangeLabel: string;
  filters: string[];
  brief: string;
  kpis: ReturnType<typeof kpisFromSessions>;
  truncated: boolean;
  fetched: number;
  total: number | null;
}): string {
  return [
    "SimBox study extract",
    `Exported: ${opts.exportedAt}`,
    `By: ${opts.exporter}`,
    `Period: ${opts.rangeLabel}`,
    `Filters: ${opts.filters.length ? opts.filters.join("; ") : "none beyond period"}`,
    "",
    opts.brief,
    "",
    "Session-level counts (not raw event rows)",
    `Starts: ${opts.kpis.starts}`,
    `Completions: ${opts.kpis.completions}`,
    `Exits: ${opts.kpis.exits}`,
    `Active cases: ${opts.kpis.active_cases}`,
    `Median completed duration (seconds): ${opts.kpis.median_completion_seconds ?? ""}`,
    `Mean completed duration (seconds): ${opts.kpis.avg_completion_seconds ?? ""}`,
    "",
    "Data notes",
    "- One row per anonymous browser-tab session.",
    "- Duration uses reported elapsed_seconds when present, otherwise wall-clock from first to last action. Elapsed is capped at 12 hours at ingest.",
    "- Location is approximate city-level IP geolocation. IP is not stored. This is not a named user, hospital, or street address.",
    `- Events loaded: ${opts.fetched}${opts.total != null ? ` of ${opts.total}` : ""}${opts.truncated ? " (TRUNCATED)" : ""}.`,
    "",
  ].join("\n");
}
