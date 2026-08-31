import { describe, expect, it } from "vitest";
import {
  annotateShadowOverlap,
  hasStableShadowIdentity,
  summarizeShadowCoverage,
} from "./lib/shadow-coverage.mjs";

function candidate(overrides = {}) {
  return {
    eventKey: "event-a",
    eventKind: "announcement",
    subjectKey: "game a",
    canonicalSubjectKey: null,
    tier: "B",
    timeRelation: "window",
    adjacentMatch: false,
    appearances: [{sourceId: "shadow-a"}],
    ...overrides,
  };
}

const eligible = (item) => item.tier !== "C" && item.timeRelation === "window" && !item.adjacentMatch;

describe("shadow coverage identity confidence", () => {
  it("does not call an unresolved cross-language subject unique", () => {
    const active = [candidate({eventKey:"active-halloween",eventKind:"other",subjectKey:"halloween the game"})];
    const shadow = annotateShadowOverlap(active, [candidate({eventKey:"shadow-halloween",eventKind:"other",subjectKey:"マイケル"})]);
    const summary = summarizeShadowCoverage(shadow, [{sourceId:"shadow-a",mode:"shadow"}], eligible);
    expect(summary.reviewableCandidates).toBe(1);
    expect(summary.uniqueCandidates).toBe(0);
    expect(summary.overlappingCandidates).toBe(0);
    expect(summary.identityUnresolvedCandidates).toBe(1);
    expect(summary.bySource[0].identityUnresolvedCandidates).toBe(1);
  });

  it("allows a canonical subject plus event kind to establish uniqueness", () => {
    const shadow = annotateShadowOverlap([], [candidate({canonicalSubjectKey:"game-a",eventKind:"release-date"})]);
    const summary = summarizeShadowCoverage(shadow, [{sourceId:"shadow-a",mode:"shadow"}], eligible);
    expect(hasStableShadowIdentity(shadow[0])).toBe(true);
    expect(summary.uniqueCandidates).toBe(1);
    expect(summary.identityUnresolvedCandidates).toBe(0);
  });

  it("still recognizes an exact unresolved event as overlap without calling other unresolved items unique", () => {
    const active = [candidate({eventKey:"same-event",eventKind:"other",subjectKey:null})];
    const shadow = annotateShadowOverlap(active, [candidate({eventKey:"same-event",eventKind:"other",subjectKey:null})]);
    const summary = summarizeShadowCoverage(shadow, [{sourceId:"shadow-a",mode:"shadow"}], eligible);
    expect(summary.overlappingCandidates).toBe(1);
    expect(summary.uniqueCandidates).toBe(0);
    expect(summary.identityUnresolvedCandidates).toBe(0);
  });
});
