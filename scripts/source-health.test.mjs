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

  it("persists filtering, timed contribution and unknown-time health separately for shadow promotion decisions", () => {
    const first = updateSourceHealth({generatedAt:"2026-09-01T02:10:00Z",sourceStats:[{
      sourceId:"deep-media",
      mode:"shadow",
      capabilities:["features"],
      status:"ok",
      count:10,
      filteredCount:4,
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
      filteredCount:2,
      durationMs:110,
      shadowReviewableCandidates:2,
      shadowUniqueCandidates:1,
      shadowOverlappingCandidates:1,
      shadowUnknownTimeCandidates:3,
    }]}, first);
    expect(second.sources["deep-media"].lastFilteredCandidates).toBe(2);
    expect(second.sources["deep-media"].averageFilteredCandidatesRecent).toBe(3);
    expect(second.sources["deep-media"].lastUniqueCandidates).toBe(1);
    expect(second.sources["deep-media"].lastUnknownTimeCandidates).toBe(3);
    expect(second.sources["deep-media"].averageReviewableCandidatesRecent).toBe(3);
    expect(second.sources["deep-media"].averageUniqueCandidatesRecent).toBe(2);
    expect(second.sources["deep-media"].averageUnknownTimeCandidatesRecent).toBe(4);
    expect(second.sources["deep-media"].overlapRateRecent).toBeCloseTo(2 / 6);
  });
});

 it("distinguishes empty parsing and unavailable sources, including legacy history", () => {
   const previous = { sources: { a: { recent: [{ at: "2026-09-07", status: "ok", count: 0 }] } } };
   const report = (status, count) => ({ generatedAt: "2026-09-08", sourceStats: [{ sourceId: "a", mode: "active", status, count }] });
   const empty = updateSourceHealth(report("ok", 0), previous);
   expect(empty.sources.a.dataStatus).toBe("empty");
   expect(empty.sources.a.consecutiveEmptyResponses).toBe(2);
   expect(empty.sources.a.successRateRecent).toBe(1);
   expect(empty.sources.a.usableResponseRateRecent).toBe(0);
   expect(empty.sources.a.contributionMetricsScope).toBe("not_measured");
   const recovered = updateSourceHealth(report("ok", 3), empty);
   expect(recovered.sources.a.dataStatus).toBe("available");
   expect(recovered.sources.a.consecutiveEmptyResponses).toBe(0);
   expect(recovered.sources.a.lastDataAt).toBe("2026-09-08");
   expect(recovered.sources.a.usableResponseRateRecent).toBeCloseTo(1 / 3);
   const failed = updateSourceHealth(report("limited", 0), recovered);
   expect(failed.sources.a.dataStatus).toBe("unavailable");
   expect(failed.sources.a.lastDataAt).toBe("2026-09-08");
   expect(failed.sources.a.consecutiveFailures).toBe(1);
 });
