import { describe, expect, it } from "vitest";
import type { CaseEventRecord } from "./types";
import {
  durationBuckets,
  filterSessionsByMinDuration,
  funnelFromSessions,
  hourMix,
  kpisFromSessions,
  sessionTimeline,
  siteCohorts,
  studyBrief,
  summarizeSessions,
  timeOnStep,
  unionStepLabels,
  weekdayMix,
} from "./reporting";

function event(partial: Partial<CaseEventRecord> & Pick<CaseEventRecord, "id" | "event_type" | "occurred_at">): CaseEventRecord {
  return {
    created_at: partial.occurred_at,
    case_id: "case-1",
    session_id: "sess-1",
    event_key: `${partial.session_id ?? "sess-1"}:${partial.event_type}`,
    elapsed_seconds: 0,
    delivery_context: "github_direct",
    device_type: "desktop",
    app_version: "1.0.0",
    metadata: {},
    cases: { case_key: "SimBox_Asthma", display_name: "Asthma", active: true },
    ...partial,
  };
}

describe("summarizeSessions", () => {
  it("groups actions and prefers resolved locality", () => {
    const rows = [
      event({
        id: "1",
        event_type: "case_started",
        occurred_at: "2026-08-19T12:00:00.000Z",
        metadata: { environment: "production" },
      }),
      event({
        id: "2",
        event_type: "case_checkpoint",
        occurred_at: "2026-08-19T12:01:00.000Z",
        elapsed_seconds: 60,
        metadata: { step: 2, slideTitle: "Step 2", city: "Atlanta", region: "Georgia", postal: "30303", country: "United States" },
      }),
      event({
        id: "3",
        event_type: "case_completed",
        occurred_at: "2026-08-19T12:04:00.000Z",
        elapsed_seconds: 240,
        metadata: { step: 5, slideTitle: "Step 5", siteKey: "EMORY1" },
      }),
    ];
    const [session] = summarizeSessions(rows);
    expect(session.outcome).toBe("completed");
    expect(session.event_count).toBe(3);
    expect(session.checkpoint_count).toBe(1);
    expect(session.city).toBe("Atlanta");
    expect(session.county).toBe("");
    expect(session.postal).toBe("30303");
    expect(session.site).toBe("EMORY1");
    expect(session.elapsed_seconds).toBe(240);
    expect(unionStepLabels([session])).toEqual(["Step 2"]);
  });
});

describe("study insights", () => {
  it("builds a funnel, duration bins, and local time-of-day mix", () => {
    const rows = [
      event({
        id: "1",
        event_type: "case_started",
        occurred_at: "2026-08-17T14:00:00.000Z",
        metadata: { environment: "production" },
      }),
      event({
        id: "2",
        event_type: "case_checkpoint",
        occurred_at: "2026-08-17T14:01:00.000Z",
        elapsed_seconds: 60,
        metadata: { step: 2, slideTitle: "Step 2" },
      }),
      event({
        id: "3",
        event_type: "case_completed",
        occurred_at: "2026-08-17T14:08:00.000Z",
        elapsed_seconds: 480,
        session_id: "sess-1",
      }),
      event({
        id: "4",
        event_type: "case_started",
        occurred_at: "2026-08-18T02:00:00.000Z",
        session_id: "sess-2",
        metadata: { environment: "production" },
      }),
      event({
        id: "5",
        event_type: "case_exited",
        occurred_at: "2026-08-18T02:03:00.000Z",
        elapsed_seconds: 90,
        session_id: "sess-2",
      }),
    ];
    const sessions = summarizeSessions(rows);
    const funnel = funnelFromSessions(sessions);
    expect(funnel[0]?.n).toBe(2);
    expect(funnel.some((r) => r.label === "Completed" && r.n === 1)).toBe(true);
    expect(durationBuckets(sessions).find((r) => r.label === "5–10 min")?.n).toBe(1);
    expect(weekdayMix(sessions).reduce((n, r) => n + r.n, 0)).toBe(2);
    expect(hourMix(sessions).reduce((n, r) => n + r.n, 0)).toBe(2);
    const dwell = timeOnStep(sessions);
    expect(dwell.some((r) => r.reached >= 1)).toBe(true);
    expect(siteCohorts(sessions)[0]?.starts).toBeGreaterThan(0);
    expect(studyBrief({
      rangeLabel: "19 Aug 2026 – 19 Aug 2026",
      sessions,
      rawCount: sessions.length,
      minSessionSeconds: 0,
      truncated: false,
      fetched: 5,
      total: 5,
    })).toMatch(/session/);
  });
});

describe("session duration filter", () => {
  it("filters sessions below a minimum wall-clock length", () => {
    const rows = [
      event({
        id: "1",
        event_type: "case_started",
        occurred_at: "2026-08-19T12:00:00.000Z",
        session_id: "short",
        metadata: { environment: "production" },
      }),
      event({
        id: "2",
        event_type: "case_exited",
        occurred_at: "2026-08-19T12:01:00.000Z",
        elapsed_seconds: 60,
        session_id: "short",
      }),
      event({
        id: "3",
        event_type: "case_started",
        occurred_at: "2026-08-19T13:00:00.000Z",
        session_id: "long",
        metadata: { environment: "production" },
      }),
      event({
        id: "4",
        event_type: "case_completed",
        occurred_at: "2026-08-19T13:10:00.000Z",
        elapsed_seconds: 600,
        session_id: "long",
      }),
    ];
    const sessions = summarizeSessions(rows);
    const filtered = filterSessionsByMinDuration(sessions, 300);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.session_id).toBe("long");
    expect(kpisFromSessions(filtered).completions).toBe(1);
  });
});

describe("sessionTimeline", () => {
  it("orders actions and records deltas in seconds", () => {
    const steps = sessionTimeline([
      event({ id: "b", event_type: "case_completed", occurred_at: "2026-08-19T12:00:10.000Z" }),
      event({ id: "a", event_type: "case_started", occurred_at: "2026-08-19T12:00:00.000Z" }),
    ]);
    expect(steps.map((s) => s.event.event_type)).toEqual(["case_started", "case_completed"]);
    expect(steps[1].deltaSec).toBe(10);
  });
});
