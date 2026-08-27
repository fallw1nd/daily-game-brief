import { describe, expect, it } from "vitest";
import { expectedEditorialWindow, validateFinalizedEditorialPacket } from "./lib/editorial-packet.mjs";

function packetFor(editionId, overrides = {}) {
  const window = expectedEditorialWindow(editionId);
  return {
    schemaVersion: 3,
    generatedAt: "2026-08-27T09:00:01.000Z",
    finalizedAt: editionId.endsWith("-am") ? "2026-08-27T02:10:01.000Z" : "2026-08-27T09:00:01.000Z",
    coverageThrough: window.windowEnd,
    mode: "chatgpt-handoff",
    outputSchema: { type: "object" },
    editorialInput: {
      schemaVersion: 2,
      window,
      packages: [],
      trackingQueue: [],
    },
    ...overrides,
  };
}

describe("finalized editorial packet validation", () => {
  it("derives the exact fixed morning window across the previous date", () => {
    expect(expectedEditorialWindow("2026-08-28-am")).toEqual({
      id: "2026-08-28-am",
      period: "am",
      plannedAt: "2026-08-28 10:10",
      windowStart: "2026-08-27 17:00",
      windowEnd: "2026-08-28 10:10",
    });
  });

  it("accepts a finalized packet for the exact evening window", () => {
    expect(validateFinalizedEditorialPacket(packetFor("2026-08-27-pm"), {
      editionId: "2026-08-27-pm",
      period: "pm",
    })).toEqual([]);
  });

  it("rejects stale, malformed, or pre-cutoff packets so recovery can rebuild them", () => {
    const base = packetFor("2026-08-27-am");
    const errors = validateFinalizedEditorialPacket({
      ...base,
      schemaVersion: 2,
      finalizedAt: "2026-08-27T02:09:59.000Z",
      coverageThrough: "2026-08-27 10:09",
      editorialInput: {
        ...base.editorialInput,
        window: { ...base.editorialInput.window, windowStart: "2026-08-27 00:00" },
      },
    }, { editionId: "2026-08-27-am", period: "am" });
    expect(errors).toContain("packet must use finalized schemaVersion 3");
    expect(errors).toContain("packet finalizedAt must be at or after the fixed cutoff");
    expect(errors).toContain("packet coverageThrough must be 2026-08-27 10:10");
    expect(errors).toContain("packet window windowStart must be 2026-08-26 17:00");
  });
});
