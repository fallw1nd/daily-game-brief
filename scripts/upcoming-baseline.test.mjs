import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { filterUpcomingWindow, loadCanonicalUpcomingBaseline, upcomingRefreshRange } from "./lib/upcoming-baseline.mjs";

const item = (id, date) => ({ id, date });

describe("Daily upcoming baseline", () => {
  it("keeps only the strict future 15-day window", () => {
    expect(filterUpcomingWindow([
      item("today", "09.08"),
      item("tomorrow", "09.09"),
      item("edge", "09.23"),
      item("outside", "09.24"),
    ], "2026-09-08").map((entry) => entry.id)).toEqual(["tomorrow", "edge"]);
  });

  it("rolls across the year boundary", () => {
    expect(filterUpcomingWindow([
      item("new-year", "01.02"),
      item("late", "01.20"),
    ], "2026-12-30").map((entry) => entry.id)).toEqual(["new-year"]);
  });

  it("computes only the uncovered tail of the new 15-day horizon", () => {
    expect(upcomingRefreshRange("2026-08-31-daily", "2026-09-08")).toEqual({
      startInclusive: "2026-09-16",
      endInclusive: "2026-09-23",
    });
    expect(upcomingRefreshRange("2026-09-08-daily", "2026-09-08")).toBeNull();
    expect(upcomingRefreshRange("2026-09-08-daily", "2026-09-09")).toEqual({
      startInclusive: "2026-09-24",
      endInclusive: "2026-09-24",
    });
  });

  it("falls back to the newest non-empty Canonical snapshot when latest is empty", async () => {
    const root = await mkdtemp(join(tmpdir(), "daily-calendar-"));
    await mkdir(join(root, "archive/2026/08"), { recursive: true });
    await writeFile(join(root, "archive/2026/08/2026-08-31-daily.json"), JSON.stringify({
      id: "2026-08-31-daily",
      upcoming: [item("expired", "09.07"), item("kept", "09.10"), item("last-verified-day", "09.15")],
    }));
    const result = await loadCanonicalUpcomingBaseline({
      latest: { id: "2026-09-08-daily", upcoming: [] },
      manifest: {
        latest: "2026-09-08-daily",
        editions: [
          { id: "2026-08-31-daily", path: "archive/2026/08/2026-08-31-daily.json" },
          { id: "2026-09-08-daily", path: "archive/2026/09/2026-09-08-daily.json" },
        ],
      },
      editionDate: "2026-09-08",
      dataRoot: root,
    });
    expect(result.sourceEditionId).toBe("2026-08-31-daily");
    expect(result.items.map((entry) => entry.id)).toEqual(["kept", "last-verified-day"]);
    expect(result.refreshRange).toEqual({ startInclusive: "2026-09-16", endInclusive: "2026-09-23" });
  });

  it("prefers the latest Canonical upcoming when it is already populated", async () => {
    const result = await loadCanonicalUpcomingBaseline({
      latest: { id: "2026-09-08-daily", upcoming: [item("current", "09.12")] },
      manifest: { latest: "2026-09-08-daily", editions: [] },
      editionDate: "2026-09-08",
    });
    expect(result).toEqual({
      sourceEditionId: "2026-09-08-daily",
      items: [item("current", "09.12")],
      refreshRange: null,
    });
  });
});
