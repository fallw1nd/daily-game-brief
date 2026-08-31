import { describe, expect, it } from "vitest";
import { selectEvidenceCandidates } from "./lib/evidence-budget.mjs";

function candidates(count) {
  return Array.from({ length: count }, (_, index) => ({
    eventKey: `candidate-${index}`,
    tier: index % 4 === 0 ? "A" : "B",
    score: index % 4 === 0 ? 140 : 100,
  }));
}

describe("evidence candidate budget telemetry", () => {
  for (const count of [10, 20, 40, 80]) {
    it(`makes the 30-package cap observable under ${count} candidates`, () => {
      const result = selectEvidenceCandidates(candidates(count), 30);
      expect(result.selected).toHaveLength(Math.min(count, 30));
      expect(result.telemetry.reviewQueueCandidates).toBe(count);
      expect(result.telemetry.selectedCandidates).toBe(Math.min(count, 30));
      expect(result.telemetry.omittedByCandidateLimit).toBe(Math.max(0, count - 30));
      expect(result.omissions).toHaveLength(Math.max(0, count - 30));
      expect(result.telemetry.omittedTierA).toBe(result.omissions.filter((item) => item.tier === "A").length);
      expect(result.telemetry.omittedTierB).toBe(result.omissions.filter((item) => item.tier === "B").length);
      expect(result.omissions.every((item) => item.reason === "evidence_candidate_limit")).toBe(true);
      if (count >= 40) expect(result.telemetry.omittedTierA).toBeGreaterThan(0);
    });
  }
});
