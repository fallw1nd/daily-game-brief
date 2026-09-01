import { describe, expect, it } from "vitest";
import { applyEditorialFeedback, updateLedger } from "./lib/event-ledger.mjs";

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

  it("does not claim an edition window for outside or prior-audit observations", () => {
    const outside = updateLedger({
      generatedAt: "2026-08-31T14:54:08.656Z",
      window: { id: "2026-08-31-daily" },
      candidates: [{
        ...candidate,
        eventKey: "state-of-play",
        subjectKey: "state-of-play",
        headline: "State of Play returns",
        publishedAt: "2026-08-31T12:13:52.000Z",
        timeRelation: "outside",
      }],
    });
    expect(outside.events["state-of-play"].windowsSeen).toEqual([]);

    const inWindow = updateLedger({
      generatedAt: "2026-09-01T02:20:00.000Z",
      window: { id: "2026-09-01-daily" },
      candidates: [{
        ...candidate,
        eventKey: "state-of-play",
        subjectKey: "state-of-play",
        headline: "State of Play returns",
        publishedAt: "2026-08-31T12:13:52.000Z",
        timeRelation: "window",
      }],
    }, outside);
    expect(inWindow.events["state-of-play"].windowsSeen).toEqual(["2026-09-01-daily"]);
  });

  it("drops undecided tier-C discovery noise from the durable ledger", () => {
    const ledger = updateLedger({
      generatedAt: "2026-08-31T14:54:08.656Z",
      window: { id: "2026-08-31-daily" },
      candidates: [{
        ...candidate,
        eventKey: "stale-low-value",
        tier: "C",
        score: 67,
        timeRelation: "unknown",
      }],
    });
    expect(ledger.events["stale-low-value"]).toBeUndefined();
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

  it("writes editorial outcomes and closes tracking idempotently", () => {
    const base = updateLedger({
      generatedAt: "2026-08-26T02:00:00.000Z",
      window: { id: "2026-08-26-am" },
      candidates: [candidate],
    });
    const packet = {
      editorialInput: {
        packages: [{
          eventKey: "event-1",
          sources: [{ sourceIndex: 0, url: "https://publisher.example/news" }],
        }],
      },
    };
    const trackingDecision = {
      editionId: "2026-08-26-am",
      decisions: [{
        eventKey: "event-1", decision: "include", tracking: true,
        reason: "官方只公布了预告，继续追踪发售日。", sourceIndexes: [0], additionalSources: [],
      }],
    };
    const tracked = applyEditorialFeedback(base, trackingDecision, packet, {
      decidedAt: "2026-08-26T02:15:00.000Z",
    });
    expect(tracked.events["event-1"].editorialState).toBe("tracking");
    expect(tracked.events["event-1"].tracking.active).toBe(true);
    expect(tracked.events["event-1"].sourceUrls).toEqual(["https://publisher.example/news"]);

    const closed = applyEditorialFeedback(tracked, {
      ...trackingDecision,
      decisions: [{
        eventKey: "event-1", decision: "exclude", tracking: false,
        reason: "同一期正式修订确认无需继续追踪。", sourceIndexes: [], additionalSources: [],
      }],
    }, packet, { decidedAt: "2026-08-26T02:30:00.000Z" });
    expect(closed.events["event-1"].editorialState).toBe("closed");
    expect(closed.events["event-1"].tracking.active).toBe(false);
    expect(closed.events["event-1"].decisionHistory).toHaveLength(1);
    expect(closed.events["event-1"].decisionHistory[0].decision).toBe("exclude");
  });
});
