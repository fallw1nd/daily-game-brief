import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { latestDueWindow, plannedWindow } from "./lib/edition-window.mjs";
import { expectedEditorialWindow, validateFinalizedEditorialPacket } from "./lib/editorial-packet.mjs";
import { resolveDueEdition } from "./resolve-due-edition.mjs";

const chineseApp = await readFile("src/App.tsx", "utf8");
const englishApp = await readFile("src/EnglishApp.tsx", "utf8");

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

describe("Daily edition production contract", () => {
  it("uses a 10:10 evidence cutoff and noon planned release", () => {
    expect(plannedWindow("daily", new Date("2026-09-01T04:00:00Z"))).toEqual({
      id: "2026-09-01-daily",
      period: "daily",
      plannedAt: "2026-09-01 12:00",
      windowStart: "2026-08-31 10:10",
      windowEnd: "2026-09-01 10:10",
    });
  });

  it("preserves the one-time first-Daily bridge as historical compatibility", () => {
    expect(expectedEditorialWindow("2026-08-31-daily")).toMatchObject({
      windowStart: "2026-08-30 17:00",
      windowEnd: "2026-08-31 10:10",
    });
  });

  it("makes Daily due at cutoff rather than release time", () => {
    expect(latestDueWindow("daily", new Date("2026-09-01T02:09:59Z")).id).toBe("2026-08-31-daily");
    expect(latestDueWindow("daily", new Date("2026-09-01T02:10:00Z")).id).toBe("2026-09-01-daily");
  });

  it("accepts the finalized immutable Daily packet contract", () => {
    expect(validateFinalizedEditorialPacket(packetForDaily("2026-09-01-daily"), {
      editionId: "2026-09-01-daily",
      period: "daily",
    })).toEqual([]);
  });

  it("retains PM resolution only for historical/manual compatibility", () => {
    const result = resolveDueEdition({
      period: "pm",
      now: new Date("2026-09-01T09:00:00Z"),
      manifest: { editions: [{ id: "2026-09-01-daily", date: "2026-09-01", period: "daily", issueNumber: 21 }] },
      purpose: "packet",
    });
    expect(result.window).toMatchObject({
      id: "2026-09-01-pm",
      windowStart: "2026-09-01 10:10",
      windowEnd: "2026-09-01 17:00",
    });
  });

  it("renders Daily cadence in both locales", () => {
    expect(chineseApp).toContain('edition.period === "daily" ? "每天一期，整理值得核验的游戏行业动态。"');
    expect(chineseApp).toContain('edition.period === "daily" ? "北京时间 12:00 更新"');
    expect(englishApp).toContain('edition.period === "daily" ? "One evidence-checked video-game industry brief each day."');
    expect(englishApp).toContain('edition.period === "daily" ? "Updated at 12:00 Beijing Time"');
  });
});
