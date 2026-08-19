import { describe, expect, it } from "vitest";
import { MAX_PAYLOAD_BYTES, validateEventPayload } from "../../../supabase/functions/_shared/eventPayload.ts";

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, ".000Z");
}

function base() {
  return {
    event_type: "case_started",
    case_key: "SimBox_Penetrating_Trauma",
    session_id: "anon-session-1",
    event_key: "anon-session-1:case_started",
    occurred_at: isoNow(),
    elapsed_seconds: 0,
    delivery_context: "github_direct",
    device_type: "desktop",
    app_version: "1.0.0",
    metadata: { environment: "test" },
  };
}

describe("validateEventPayload", () => {
  it("accepts a well-formed start event", () => {
    const payload = base();
    const raw = JSON.stringify(payload);
    const result = validateEventPayload(payload, raw.length);
    expect(result.ok).toBe(true);
  });

  it("rejects unknown event types", () => {
    const payload = { ...base(), event_type: "case_failed" };
    const result = validateEventPayload(payload, JSON.stringify(payload).length);
    expect(result.ok).toBe(false);
  });

  it("rejects oversized payloads", () => {
    const result = validateEventPayload(base(), MAX_PAYLOAD_BYTES + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });

  it("rejects learner-identifying metadata keys", () => {
    const payload = { ...base(), metadata: { email: "x@y.z" } };
    const result = validateEventPayload(payload, JSON.stringify(payload).length);
    expect(result.ok).toBe(false);
  });

  it("rejects elapsed time above the 12-hour cap", () => {
    const payload = { ...base(), event_type: "case_completed", elapsed_seconds: 50_000 };
    const result = validateEventPayload(payload, JSON.stringify(payload).length);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-UTC occurred_at", () => {
    const payload = { ...base(), occurred_at: "2026-08-19T13:00:00" };
    const result = validateEventPayload(payload, JSON.stringify(payload).length);
    expect(result.ok).toBe(false);
  });

  it("accepts a checkpoint with step metadata", () => {
    const payload = {
      ...base(),
      event_type: "case_checkpoint",
      event_key: "anon-session-1:cp:5pqwHwZQxGX",
      elapsed_seconds: 12,
      metadata: { environment: "test", step: 2, slideId: "5pqwHwZQxGX", slideTitle: "Step 2" },
    };
    const result = validateEventPayload(payload, JSON.stringify(payload).length);
    expect(result.ok).toBe(true);
  });

  it("accepts a site code in metadata", () => {
    const payload = { ...base(), metadata: { environment: "production", siteKey: "HOSP01" } };
    const result = validateEventPayload(payload, JSON.stringify(payload).length);
    expect(result.ok).toBe(true);
  });
});
