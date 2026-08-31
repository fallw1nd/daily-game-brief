import { describe, expect, it } from "vitest";
import { updateSourceHealth } from "./lib/source-health.mjs";

describe("source health ledger", () => {
  it("keeps bounded recent checks and resets consecutive failures on success", () => {
    const first = updateSourceHealth({generatedAt:"2026-08-31T02:10:00Z",sourceStats:[{sourceId:"a",mode:"shadow",capabilities:["news"],status:"limited",count:0,durationMs:120,error:"HTTP 503"}]});
    expect(first.sources.a.consecutiveFailures).toBe(1);
    const second = updateSourceHealth({generatedAt:"2026-09-01T02:10:00Z",sourceStats:[{sourceId:"a",mode:"shadow",capabilities:["news"],status:"ok",count:4,durationMs:80}]}, first);
    expect(second.sources.a.consecutiveFailures).toBe(0);
    expect(second.sources.a.lastError).toBeNull();
    expect(second.sources.a.successRateRecent).toBe(0.5);
    expect(second.sources.a.averageCandidatesRecent).toBe(2);
  });

  it("persists timed contribution and unknown-time health separately for shadow promotion decisions", () => {
    const first = updateSourceHealth({generatedAt:"2026-09-01T02:10:00Z",sourceStats:[{
      sourceId:"deep-media",
      mode:"shadow",
      capabilities:["features"],
      status:"ok",
      count:10,
      durationMs:90,
      shadowReviewableCandidates:4,
      shadowUniqueCandidates:3,
      shadowOverlappingCandidates:1,
      shadowUnknownTimeCandidates:5,
    }]});
    const second = updateSourceHealth({generatedAt:"2026-09-02T02:10:00Z",sourceStats:[{
      sourceId:"deep-media",
      mode:"shadow",
      capabilities:["features"],
      status:"ok",
      count:8,
      durationMs:110,
      shadowReviewableCandidates:2,
      shadowUniqueCandidates:1,
      shadowOverlappingCandidates:1,
      shadowUnknownTimeCandidates:3,
    }]}, first);
    expect(second.sources["deep-media"].lastUniqueCandidates).toBe(1);
    expect(second.sources["deep-media"].lastUnknownTimeCandidates).toBe(3);
    expect(second.sources["deep-media"].averageReviewableCandidatesRecent).toBe(3);
    expect(second.sources["deep-media"].averageUniqueCandidatesRecent).toBe(2);
    expect(second.sources["deep-media"].averageUnknownTimeCandidatesRecent).toBe(4);
    expect(second.sources["deep-media"].overlapRateRecent).toBeCloseTo(2 / 6);
  });
});
