import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { annotateShadowOverlap, shadowCandidateKey, summarizeShadowCoverage } from "./lib/shadow-coverage.mjs";

const contributionEligible = (candidate) => candidate.tier !== "C" && candidate.timeRelation === "window" && !candidate.adjacentMatch;

describe("shadow source contribution", () => {
  it("matches known multilingual subjects by canonical subject and event kind", () => {
    expect(shadowCandidateKey({canonicalSubjectKey:"game-x",eventKind:"announcement",eventKey:"a"}))
      .toBe("canonical:game-x|announcement");
    expect(shadowCandidateKey({eventKind:"other",eventKey:"fallback"})).toBe("event:fallback");
  });

  it("counts only explicit-window candidates as contribution and exposes unknown-time candidates separately", () => {
    const active = [{canonicalSubjectKey:"game-x",eventKind:"announcement",eventKey:"active-x"}];
    const shadow = annotateShadowOverlap(active, [
      {canonicalSubjectKey:"game-x",eventKind:"announcement",eventKey:"shadow-x",tier:"B",timeRelation:"window",adjacentMatch:false,appearances:[{sourceId:"s1"}]},
      {canonicalSubjectKey:"game-y",eventKind:"company",eventKey:"shadow-y",tier:"B",timeRelation:"window",adjacentMatch:false,appearances:[{sourceId:"s1"},{sourceId:"s2"}]},
      {canonicalSubjectKey:"game-old",eventKind:"other",eventKey:"shadow-old",tier:"B",timeRelation:"unknown",adjacentMatch:false,appearances:[{sourceId:"s2"}]},
      {canonicalSubjectKey:"game-z",eventKind:"other",eventKey:"shadow-z",tier:"C",timeRelation:"window",adjacentMatch:false,appearances:[{sourceId:"s2"}]},
    ]);
    const summary = summarizeShadowCoverage(shadow, [
      {sourceId:"s1",mode:"shadow"},
      {sourceId:"s2",mode:"shadow"},
    ], contributionEligible);
    expect(summary.reviewableCandidates).toBe(2);
    expect(summary.uniqueCandidates).toBe(1);
    expect(summary.overlappingCandidates).toBe(1);
    expect(summary.identityUnresolvedCandidates).toBe(0);
    expect(summary.unknownTimeCandidates).toBe(1);
    expect(summary.overlapRate).toBe(0.5);
    expect(summary.bySource.find((item) => item.sourceId === "s1")).toMatchObject({reviewableCandidates:2,uniqueCandidates:1,overlappingCandidates:1,identityUnresolvedCandidates:0,unknownTimeCandidates:0});
    expect(summary.bySource.find((item) => item.sourceId === "s2")).toMatchObject({reviewableCandidates:1,uniqueCandidates:1,overlappingCandidates:0,identityUnresolvedCandidates:0,unknownTimeCandidates:1});
  });

  it("keeps the production review queue broader than shadow contribution metrics", async () => {
    const collector = await readFile("scripts/collect-news.mjs", "utf8");
    expect(collector).toContain('const reviewable = (candidate) => candidate.tier !== "C" && candidate.timeRelation !== "outside" && !candidate.adjacentMatch;');
    expect(collector).toContain('const shadowContributionEligible = (candidate) => candidate.tier !== "C" && candidate.timeRelation === "window" && !candidate.adjacentMatch;');
    expect(collector).toContain("summarizeShadowCoverage(shadowCandidates, rawSourceStats, shadowContributionEligible)");
    expect(collector).toContain("reviewQueue: candidates.filter(reviewable)");
  });
});
