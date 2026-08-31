import { describe, expect, it } from "vitest";

import { latestDueWindow, plannedWindow } from "./lib/edition-window.mjs";
import { expectedEditorialWindow, validateFinalizedEditorialPacket } from "./lib/editorial-packet.mjs";
import { resolveDueEdition } from "./resolve-due-edition.mjs";

function packetForDaily(editionId) {
  const window = expectedEditorialWindow(editionId);
  return {
    schemaVersion: 3,
    generatedAt: "2026-09-01T02:10:01.000Z",
    finalizedAt: "2026-09-01T02:10:01.000Z",
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
  it("uses a 10:10 evidence cutoff while scheduling the Daily edition for noon", () => {
    expect(plannedWindow("daily", new Date("2026-09-01T04:00:00Z"))).toEqual({
      id: "2026-09-01-daily",
      period: "daily",
      plannedAt: "2026-09-01 12:00",
      windowStart: "2026-08-31 10:10",
      windowEnd: "2026-09-01 10:10",
    });
    expect(expectedEditorialWindow("2026-09-01-daily")).toEqual({
      id: "2026-09-01-daily",
      period: "daily",
      plannedAt: "2026-09-01 12:00",
      windowStart: "2026-08-31 10:10",
      windowEnd: "2026-09-01 10:10",
    });
  });

  it("makes Daily due at the evidence cutoff rather than the noon publication time", () => {
    expect(latestDueWindow("daily", new Date("2026-09-01T02:09:59Z")).id).toBe("2026-08-31-daily");
    expect(latestDueWindow("daily", new Date("2026-09-01T02:10:00Z")).id).toBe("2026-09-01-daily");
  });

  it("accepts a finalized immutable Daily packet without changing packet schemaVersion 3", () => {
    expect(validateFinalizedEditorialPacket(packetForDaily("2026-09-01-daily"), {
      editionId: "2026-09-01-daily",
      period: "daily",
    })).toEqual([]);
  });

  it("cuts over cleanly after the final legacy AM edition without an overlap bridge", () => {
    const manifest = {
      editions: [{ id: "2026-08-31-am", date: "2026-08-31", period: "am", issueNumber: 20 }],
    };
    const before = resolveDueEdition({
      period: "daily",
      now: new Date("2026-09-01T02:09:59Z"),
      manifest,
      purpose: "packet",
    });
    const atCutoff = resolveDueEdition({
      period: "daily",
      now: new Date("2026-09-01T02:10:00Z"),
      manifest,
      purpose: "packet",
    });
    expect(before.needed).toBe(false);
    expect(atCutoff.needed).toBe(true);
    expect(atCutoff.window).toMatchObject({
      id: "2026-09-01-daily",
      plannedAt: "2026-09-01 12:00",
      windowStart: "2026-08-31 10:10",
      windowEnd: "2026-09-01 10:10",
    });
  });

  it("rolls back from a published Daily into the same-day PM window without gaps", () => {
    const manifest = {
      editions: [{ id: "2026-09-01-daily", date: "2026-09-01", period: "daily", issueNumber: 21 }],
    };
    const result = resolveDueEdition({
      period: "pm",
      now: new Date("2026-09-01T09:00:00Z"),
      manifest,
      purpose: "packet",
    });
    expect(result.needed).toBe(true);
    expect(result.window).toMatchObject({
      id: "2026-09-01-pm",
      windowStart: "2026-09-01 10:10",
      windowEnd: "2026-09-01 17:00",
    });
  });
});
