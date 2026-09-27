import { describe, expect, it } from "vitest";
import { buildEditorialLedgerView, shouldQueueTrackingReminder } from "./lib/editorial-ledger-view.mjs";

function tracked(overrides = {}) {
  return {
    eventKey: "tracked-event",
    lastSeenAt: "2026-09-20T02:00:00.000Z",
    lastDecisionAt: "2026-09-21T02:00:00.000Z",
    tracking: { active: true, reason: "等待新证据" },
    ...overrides,
  };
}

describe("editorial tracking ledger view", () => {
  it("suppresses an unchanged reminder after an editorial decision", () => {
    expect(shouldQueueTrackingReminder(tracked())).toBe(false);
  });

  it("queues tracking when the ledger has new evidence after the last decision", () => {
    expect(shouldQueueTrackingReminder(tracked({ lastSeenAt: "2026-09-22T02:00:00.000Z" }))).toBe(true);
  });

  it("queues an active item that has opened evidence in the current package", () => {
    const evidenceItem = { sources: [{ status: "opened", evidenceText: "new primary evidence" }] };
    expect(shouldQueueTrackingReminder(tracked(), evidenceItem)).toBe(true);
  });

  it("keeps invalid timestamps actionable instead of silently dropping review", () => {
    expect(shouldQueueTrackingReminder(tracked({ lastSeenAt: "not-a-date" }))).toBe(true);
  });

  it("preserves non-tracking ledger entries while omitting only unchanged active reminders", () => {
    const ledger = {
      schemaVersion: 1,
      events: {
        stale: tracked({ eventKey: "stale" }),
        fresh: tracked({ eventKey: "fresh", lastSeenAt: "2026-09-22T02:00:00.000Z" }),
        closed: { eventKey: "closed", tracking: { active: false } },
      },
    };
    const result = buildEditorialLedgerView(ledger, { packages: [] });
    expect(Object.keys(result.ledger.events).sort()).toEqual(["closed", "fresh"]);
    expect(result.metrics).toEqual({
      totalActiveTracking: 2,
      queuedActiveTracking: 1,
      suppressedNoNewEvidence: 1,
    });
  });
});
