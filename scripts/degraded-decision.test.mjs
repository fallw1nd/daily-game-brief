import { describe, expect, it } from "vitest";
import { buildDegradedDecision } from "./lib/degraded-decision.mjs";

function packet(overrides = {}, window = { id: "2026-08-27-am", period: "am" }) {
  return { editorialInput: { window, trackingQueue: [], packages: [{
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

  it("uses the Daily archive prefix and replacement calendar mode", () => {
    const output = buildDegradedDecision(packet({}, { id: "2026-09-01-daily", period: "daily" }));
    expect(output.archiveTitle).toMatch(/^日报｜/);
    expect(output.upcomingMode).toBe("replace");
  });

  it("preserves legacy AM and PM degraded semantics", () => {
    const morning = buildDegradedDecision(packet());
    const evening = buildDegradedDecision(packet({}, { id: "2026-08-27-pm", period: "pm" }));
    expect(morning.archiveTitle).toMatch(/^早报｜/);
    expect(morning.upcomingMode).toBe("replace");
    expect(evening.archiveTitle).toMatch(/^晚报｜/);
    expect(evening.upcomingMode).toBe("inherit_and_patch");
  });

  it("refuses to fabricate an edition when no event clears the threshold", () => {
    expect(() => buildDegradedDecision(packet({ tier: "B" }))).toThrow(/No high-confidence/);
  });

  it("keeps unresolved tracking open without AI judgment", () => {
    const value = packet();
    value.editorialInput.trackingQueue = [{ eventKey: "tracked-event", reason: "等待官方确认。" }];
    const output = buildDegradedDecision(value);
    expect(output.decisions[1]).toMatchObject({
      eventKey: "tracked-event", decision: "needs_review", tracking: true,
    });
  });
});
