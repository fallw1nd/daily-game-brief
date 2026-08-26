import { describe, expect, it } from "vitest";
import { updateLedger } from "./lib/event-ledger.mjs";

const candidate = {
  eventKey: "event-1",
  eventKind: "announcement",
  subjectKey: "game one",
  headline: "Game One announced",
  publishedAt: "2026-08-26T01:00:00.000Z",
  tier: "A",
  score: 140,
  adjacentMatch: false,
  appearances: [{ sourceId: "publisher" }],
};

describe("persistent event ledger", () => {
  it("retains first-seen state and records recurring windows", () => {
    const first = updateLedger({
      generatedAt: "2026-08-26T02:00:00.000Z",
      window: { id: "2026-08-26-am" },
      candidates: [candidate],
    });
    const second = updateLedger({
      generatedAt: "2026-08-26T09:00:00.000Z",
      window: { id: "2026-08-26-pm" },
      candidates: [candidate],
    }, first);
    expect(second.events["event-1"].firstSeenAt).toBe("2026-08-26T02:00:00.000Z");
    expect(second.events["event-1"].windowsSeen).toEqual(["2026-08-26-am", "2026-08-26-pm"]);
    expect(second.events["event-1"].occurrences).toBe(2);
    expect(second.totals.recurring).toBe(1);
  });

  it("drops events outside retention", () => {
    const ledger = updateLedger({
      generatedAt: "2026-08-26T09:00:00.000Z",
      window: { id: "2026-08-26-pm" },
      candidates: [],
    }, {
      events: {
        old: { eventKey: "old", lastSeenAt: "2026-06-01T00:00:00.000Z", windowsSeen: [] },
      },
    }, { retentionDays: 45 });
    expect(ledger.events).toEqual({});
  });
});
