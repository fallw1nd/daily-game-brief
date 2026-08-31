import { describe, expect, it } from "vitest";
import { selectEvidenceCandidates } from "./lib/evidence-budget.mjs";

function candidates(count) {
  return Array.from({ length: count }, (_, index) => ({
    eventKey: `candidate-${index}`,
    tier: index % 4 === 0 ? "A" : "B",
    score: index % 4 === 0 ? 140 : 100,
    publisherFamily: `publisher-${index % 6}`,
    lane: index % 5 === 0 ? "industry" : "news",
  }));
}

describe("evidence candidate budget", () => {
  for (const count of [10, 20, 40, 80]) {
    it(`protects A-level candidates when ${count} review candidates fit the A budget`, () => {
      const input = candidates(count);
      const result = selectEvidenceCandidates(input, 30);
      expect(result.selected).toHaveLength(Math.min(count, 30));
      expect(result.telemetry.reviewQueueCandidates).toBe(count);
      expect(result.telemetry.omittedByCandidateLimit).toBe(Math.max(0, count - 30));
      const tierACount = input.filter((item) => item.tier === "A").length;
      expect(result.telemetry.protectedTierA).toBe(Math.min(tierACount, 30));
      if (tierACount <= 30) expect(result.telemetry.omittedTierA).toBe(0);
      expect(result.omissions.every((item) => item.reason === "evidence_candidate_limit")).toBe(true);
    });
  }

  it("uses a soft publisher ceiling before filling spare capacity", () => {
    const input = [
      ...Array.from({ length: 12 }, (_, index) => ({eventKey:`dominant-${index}`,tier:"B",score:110-index,publisherFamily:"dominant",lane:"news"})),
      ...Array.from({ length: 8 }, (_, index) => ({eventKey:`diverse-${index}`,tier:"B",score:90-index,publisherFamily:`diverse-${index}`,lane:index % 2 ? "industry" : "reviews"})),
    ];
    const result = selectEvidenceCandidates(input, 12, {publisherCeiling:3,laneCeiling:20});
    expect(result.selected).toHaveLength(12);
    expect(result.selected.filter((item) => item.eventKey.startsWith("diverse-"))).toHaveLength(8);
    expect(result.telemetry.deferredByPublisherCeiling).toBeGreaterThan(0);
  });

  it("uses a soft lane ceiling across otherwise diverse publishers", () => {
    const input = [
      ...Array.from({ length: 10 }, (_, index) => ({eventKey:`news-${index}`,tier:"B",score:110-index,publisherFamily:`news-p-${index}`,lane:"news"})),
      ...Array.from({ length: 6 }, (_, index) => ({eventKey:`industry-${index}`,tier:"B",score:90-index,publisherFamily:`industry-p-${index}`,lane:"industry"})),
    ];
    const result = selectEvidenceCandidates(input, 10, {publisherCeiling:10,laneCeiling:4});
    expect(result.selected).toHaveLength(10);
    expect(result.selected.filter((item) => item.lane === "industry")).toHaveLength(4);
    expect(result.telemetry.deferredByLaneCeiling).toBeGreaterThan(0);
  });

  it("only omits A-level candidates when A alone exceeds the hard package cap", () => {
    const input = Array.from({length:35},(_,index)=>({eventKey:`a-${index}`,tier:"A",score:150-index,publisherFamily:`p-${index}`,lane:"news"}));
    const result = selectEvidenceCandidates(input,30);
    expect(result.telemetry.protectedTierA).toBe(30);
    expect(result.telemetry.omittedTierA).toBe(5);
  });
});
