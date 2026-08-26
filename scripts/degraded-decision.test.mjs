import { describe, expect, it } from "vitest";
import { buildDegradedDecision } from "./lib/degraded-decision.mjs";

function packet(overrides = {}) {
  return { editorialInput: { window: { id: "2026-08-27-am", period: "am" }, packages: [{
    eventKey: "event-1", eventKind: "announcement", subjectKey: "Example Game",
    headline: "Example Game announced", tier: "A", timeRelation: "window",
    sources: [{ sourceIndex: 0, status: "opened", kind: "primary", independenceKey: "publisher",
      label: "Publisher", url: "https://publisher.example/news", publishedAt: "2026-08-27T01:00:00Z",
      evidenceText: "Publisher announced Example Game for PC." }],
    ...overrides,
  }] } };
}

describe("zero-AI degraded decision", () => {
  it("includes only a windowed A-level event with strong evidence", () => {
    const output = buildDegradedDecision(packet());
    const included = output.decisions[0];
    expect(included.decision).toBe("include");
    expect(included.factStatus).toBe("official");
    expect(included.headline).toContain("自动事实清单");
  });

  it("refuses to fabricate an edition when no event clears the threshold", () => {
    expect(() => buildDegradedDecision(packet({ tier: "B" }))).toThrow(/No high-confidence/);
  });
});
