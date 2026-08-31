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
});
