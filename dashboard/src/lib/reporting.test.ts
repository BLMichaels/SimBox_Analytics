import { describe, expect, it } from "vitest";
import type { CaseEventRecord } from "./types";
import { sessionTimeline, summarizeSessions } from "./reporting";

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
    expect(session.postal).toBe("30303");
    expect(session.site).toBe("EMORY1");
    expect(session.elapsed_seconds).toBe(240);
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
