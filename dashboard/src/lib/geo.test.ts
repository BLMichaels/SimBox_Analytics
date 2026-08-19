import { describe, expect, it } from "vitest";
import { canonicalCountry, canonicalState, countyKey, isUnitedStates, pointInCoords } from "./geo";
import { bucketLocations, sessionsForMetric, type LocationBucket } from "./mapData";
import type { SessionSummary } from "./reporting";

describe("geo names", () => {
  it("treats US aliases as the United States", () => {
    expect(canonicalCountry("US")).toBe("United States of America");
    expect(isUnitedStates("United States")).toBe(true);
    expect(canonicalState("NY")).toBe("New York");
    expect(countyKey("Saratoga County")).toBe("saratoga");
  });

  it("detects a point inside a square ring", () => {
    const ring = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];
    expect(pointInCoords([ring], 1, 1)).toBe(true);
    expect(pointInCoords([ring], 5, 5)).toBe(false);
  });
});

describe("map buckets", () => {
  it("keeps only completed sessions for the completed metric", () => {
    const sessions = [
      { outcome: "completed" },
      { outcome: "exited" },
      { outcome: "in_progress" },
    ] as SessionSummary[];
    expect(sessionsForMetric(sessions, "completed")).toHaveLength(1);
    expect(sessionsForMetric(sessions, "started")).toHaveLength(3);
  });

  it("groups nearby sessions", () => {
    const placed = [
      { lat: 43.08, lng: -73.78, place: "Saratoga Springs, New York, United States", city: "Saratoga Springs", region: "New York", country: "United States", outcome: "completed", case_name: "Asthma", case_key: "SimBox_Asthma" },
      { lat: 43.08, lng: -73.78, place: "Saratoga Springs, New York, United States", city: "Saratoga Springs", region: "New York", country: "United States", outcome: "exited", case_name: "Asthma", case_key: "SimBox_Asthma" },
    ] as unknown as Parameters<typeof bucketLocations>[0];
    const buckets: LocationBucket[] = bucketLocations(placed);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.starts).toBe(2);
    expect(buckets[0]?.completions).toBe(1);
    expect(buckets[0]?.cases.SimBox_Asthma?.completions).toBe(1);
  });
});
