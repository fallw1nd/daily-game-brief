import { describe, expect, it } from "vitest";
import {
  archiveTitlePrefix,
  editionWindowForDate,
  englishArchiveTitlePrefix,
  expectedEditorialWindow,
  latestDueWindow,
  nextEditionAt,
} from "./lib/edition-window.mjs";

describe("edition window contract", () => {
  it("preserves historical AM and PM windows", () => {
    expect(expectedEditorialWindow("2026-08-31-am")).toEqual({
      id: "2026-08-31-am", period: "am", plannedAt: "2026-08-31 10:10",
      windowStart: "2026-08-30 17:00", windowEnd: "2026-08-31 10:10",
    });
    expect(expectedEditorialWindow("2026-08-31-pm")).toEqual({
      id: "2026-08-31-pm", period: "pm", plannedAt: "2026-08-31 17:00",
      windowStart: "2026-08-31 10:10", windowEnd: "2026-08-31 17:00",
    });
  });

  it("defines Daily as previous 17:00 exclusive through current 17:00 inclusive", () => {
    expect(expectedEditorialWindow("2026-09-01-daily")).toEqual({
      id: "2026-09-01-daily", period: "daily", plannedAt: "2026-09-01 17:00",
      windowStart: "2026-08-31 17:00", windowEnd: "2026-09-01 17:00",
    });
    expect(nextEditionAt(editionWindowForDate("2026-09-01", "daily"))).toBe("2026-09-02 17:00");
    expect(archiveTitlePrefix("daily")).toBe("日报｜");
    expect(englishArchiveTitlePrefix("daily")).toBe("Daily Brief |");
  });

  it("selects the latest already-due Daily across midnight without moving its cutoff", () => {
    expect(latestDueWindow("daily", new Date("2026-09-01T03:00:00Z")).id).toBe("2026-08-31-daily");
    expect(latestDueWindow("daily", new Date("2026-09-01T09:00:00Z")).id).toBe("2026-09-01-daily");
  });

  it("makes the last PM and first Daily contiguous with no same-day Daily", () => {
    const pm = editionWindowForDate("2026-08-31", "pm");
    const daily = editionWindowForDate("2026-09-01", "daily");
    expect(pm.windowEnd).toBe(daily.windowStart);
    expect(pm.id).toBe("2026-08-31-pm");
    expect(daily.id).toBe("2026-09-01-daily");
  });

  it("defines Daily rollback to the next AM boundary", () => {
    const daily = editionWindowForDate("2026-09-01", "daily");
    const am = editionWindowForDate("2026-09-02", "am");
    expect(daily.windowEnd).toBe(am.windowStart);
    expect(am.windowEnd).toBe("2026-09-02 10:10");
  });
});
