import { describe, expect, it } from "vitest";

import { latestDueWindow, plannedWindow } from "./lib/edition-window.mjs";
import { expectedEditorialWindow, validateFinalizedEditorialPacket } from "./lib/editorial-packet.mjs";
import { resolveDueEdition } from "./resolve-due-edition.mjs";

function packetForDaily(editionId) {
  const window = expectedEditorialWindow(editionId);
  return {
    schemaVersion: 3,
    generatedAt: "2026-09-01T09:00:01.000Z",
    finalizedAt: "2026-09-01T09:00:01.000Z",
    coverageThrough: window.windowEnd,
    mode: "chatgpt-handoff",
    outputSchema: { type: "object" },
    editorialInput: {
      schemaVersion: 2,
      window,
      packages: [],
      trackingQueue: [],
    },
  };
}

describe("Daily Edition precutover compatibility", () => {
  it("derives Daily as previous-day 17:00 exclusive through current-day 17:00 inclusive", () => {
    expect(plannedWindow("daily", new Date("2026-09-01T04:00:00Z"))).toEqual({
      id: "2026-09-01-daily",
      period: "daily",
      plannedAt: "2026-09-01 17:00",
      windowStart: "2026-08-31 17:00",
      windowEnd: "2026-09-01 17:00",
    });
    expect(expectedEditorialWindow("2026-09-01-daily")).toEqual({
      id: "2026-09-01-daily",
      period: "daily",
      plannedAt: "2026-09-01 17:00",
      windowStart: "2026-08-31 17:00",
      windowEnd: "2026-09-01 17:00",
    });
  });

  it("keeps the current date before cutoff pointed at the previous Daily edition", () => {
    expect(latestDueWindow("daily", new Date("2026-09-01T08:59:59Z")).id).toBe("2026-08-31-daily");
    expect(latestDueWindow("daily", new Date("2026-09-01T09:00:00Z")).id).toBe("2026-09-01-daily");
  });

  it("accepts a finalized immutable Daily packet without changing packet schemaVersion 3", () => {
    expect(validateFinalizedEditorialPacket(packetForDaily("2026-09-01-daily"), {
      editionId: "2026-09-01-daily",
      period: "daily",
    })).toEqual([]);
  });

  it("selects the first Daily only after the final legacy PM cutoff", () => {
    const manifest = {
      editions: [{ id: "2026-08-31-pm", date: "2026-08-31", period: "pm", issueNumber: 20 }],
    };
    const before = resolveDueEdition({
      period: "daily",
      now: new Date("2026-09-01T08:59:59Z"),
      manifest,
      purpose: "packet",
    });
    const atCutoff = resolveDueEdition({
      period: "daily",
      now: new Date("2026-09-01T09:00:00Z"),
      manifest,
      purpose: "packet",
    });
    expect(before.needed).toBe(false);
    expect(atCutoff.needed).toBe(true);
    expect(atCutoff.window.id).toBe("2026-09-01-daily");
    expect(atCutoff.window.windowStart).toBe("2026-08-31 17:00");
  });

  it("rolls back from a published Daily to the next morning window, never to the same-day PM", () => {
    const manifest = {
      editions: [{ id: "2026-09-01-daily", date: "2026-09-01", period: "daily", issueNumber: 21 }],
    };
    const result = resolveDueEdition({
      period: "am",
      now: new Date("2026-09-02T02:10:00Z"),
      manifest,
      purpose: "packet",
    });
    expect(result.needed).toBe(true);
    expect(result.window).toMatchObject({
      id: "2026-09-02-am",
      windowStart: "2026-09-01 17:00",
      windowEnd: "2026-09-02 10:10",
    });
  });
});
