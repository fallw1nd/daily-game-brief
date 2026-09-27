// @vitest-environment node
import { describe, expect, it } from "vitest";
import { collectReleaseCalendar } from "./lib/release-calendar-discovery.mjs";
import { planCalendarFallbacks } from "./lib/release-calendar-strategy.mjs";

const editionDate = "2026-09-28";
const now = new Date("2026-09-28T04:00:00.000Z");
const sources = [
  ["steam-popular", "PC", "steam"], ["steam-calendar", "PC", "steam"],
  ["nintendo-coming", "Nintendo", "nintendo"], ["xbox-weekly", "Xbox", "xbox"],
  ["playstation-blog", "PlayStation", "articles"], ["gamesradar-calendar", "multiplatform", "calendar"],
].map(([id, platform, adapter], index) => ({ id, platform, family: platform.toLowerCase(), adapter, kind: index === 5 ? "discovery" : "primary", priority: 2, url: `https://base.example/${id}`, maxPages: id === "steam-calendar" ? 4 : 1 }));
const fallbackSources = [
  { id: "playstation-ps5-rss", platform: "PlayStation", family: "playstation", adapter: "articles", kind: "fallback", priority: 3, url: "https://fallback.example/ps", maxPages: 1 },
  { id: "xbox-official-rss", platform: "Xbox", family: "xbox", adapter: "xbox", kind: "fallback", priority: 3, url: "https://fallback.example/xbox", maxPages: 1 },
];
const config = { sources, fallbackSources, timeoutMs: 1000, maxResponseBytes: 100000, maxCandidates: 100 };
const history = (sourceId, mode) => ({ schemaVersion: 1, sources: { [sourceId]: {
  lastObservedAt: mode === "stale" ? "2026-08-01T04:00:00.000Z" : "2026-09-27T04:00:00.000Z",
  recent: mode === "good" ? [1, 2, 3].map((_, i) => ({ fetchStatus: "success", parserStatus: "success", usefulLeads: i ? 1 : 0 }))
    : [1, 2, 3].map(() => ({ fetchStatus: "failed", parserStatus: "failed", usefulLeads: 0 })),
} } });
const empty = () => new Response("<html><body>Challenge</body></html>");

describe("calendar fallback strategy", () => {
  it.each([
    ["healthy", history("playstation-ps5-rss", "good"), 2],
    ["bad", history("playstation-ps5-rss", "bad"), 1],
    ["unknown", undefined, 2],
    ["stale", history("playstation-ps5-rss", "stale"), 2],
  ])("uses %s health to change bounded fallback decisions", async (_name, ledger, expectedAttempts) => {
    const seen = [];
    let inFlight = 0;
    let peak = 0;
    const report = await collectReleaseCalendar({ config, editionDate, now, previousHealth: ledger, fetcher: async (url) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      seen.push(url);
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight--;
      return empty();
    } });
    const baseAttempts = seen.filter(url => url.includes("base.example/"));
    const fallbacks = seen.filter(url => url.includes("fallback.example/"));
    expect(baseAttempts).toHaveLength(6);
    expect(fallbacks).toHaveLength(expectedAttempts);
    expect(fallbacks.length).toBeLessThanOrEqual(2);
    expect(peak).toBeLessThanOrEqual(2);
    expect(report.fallbackTelemetry.baseAttempted).toHaveLength(6);
    expect(report.fallbackTelemetry.platformGaps.map(item => item.platform).sort()).toEqual(["Nintendo", "PC", "PlayStation", "Xbox"].sort());
    expect(report.fallbackTelemetry.platformGaps.every(item => item.gap)).toBe(true);
    expect(report.coverage.filter(item => item.role === "fallback")).toHaveLength(expectedAttempts);
    expect(report.candidates).toEqual([]);
    expect(report.fallbackTelemetry.actualFallbackAttempts).toHaveLength(expectedAttempts);
  });

  it("tries the healthy fallback before an equally cheap unknown fallback", async () => {
    const report = await collectReleaseCalendar({ config, editionDate, now, previousHealth: history("xbox-official-rss", "good"), fetcher: async () => empty() });
    expect(report.fallbackTelemetry.actualFallbackAttempts).toEqual(["xbox-official-rss", "playstation-ps5-rss"]);
  });

  it.each([
    ["null observation", [null]],
    ["non-object observation", ["success"]],
    ["invalid status", [{ fetchStatus: "maybe", parserStatus: "unknown", usefulLeads: 0 }]],
    ["wrong-typed lead count", [{ fetchStatus: "success", parserStatus: "success", usefulLeads: "0" }]],
  ])("treats %s as unknown and keeps the fallback probe safe", (_label, recent) => {
    const plan = planCalendarFallbacks({
      baseSources: [{ id: "base", platform: "PlayStation" }],
      fallbackSources: [{ id: "fallback", platform: "PlayStation" }],
      baseResults: [{ source: { id: "base", platform: "PlayStation" }, status: "empty_or_changed", parserStatus: "unknown", sourceStatus: "success", usefulLeads: 0 }],
      editionDate, now,
      ledger: { schemaVersion: 1, sources: { fallback: { lastObservedAt: "2026-09-27T04:00:00.000Z", recent } } },
    });
    expect(plan.fallbackDecisions[0]).toMatchObject({ attempted: true, health: { class: "unknown" } });
  });

  it.each([
    ["stale", "2026-08-01T04:00:00.000Z"],
    ["future", "2026-09-29T04:00:00.000Z"],
  ])("treats %s observation timestamps as unknown history", (_label, lastObservedAt) => {
    const plan = planCalendarFallbacks({ baseSources: [{ id: "base", platform: "PlayStation" }],
      fallbackSources: [{ id: "fallback", platform: "PlayStation" }],
      baseResults: [{ source: { id: "base", platform: "PlayStation" }, status: "empty_or_changed", parserStatus: "unknown", sourceStatus: "success", usefulLeads: 0 }],
      editionDate, now,
      ledger: { schemaVersion: 1, sources: { fallback: { lastObservedAt, recent: [{ fetchStatus: "failed", parserStatus: "failed", usefulLeads: 0 }] } } },
    });
    expect(plan.fallbackDecisions[0]).toMatchObject({ attempted: true, health: { class: "unknown" } });
  });

  it("does not convert absent or null lead counts into repeated known zeroes", () => {
    const recent = Array.from({ length: 5 }, () => ({ fetchStatus: "success", parserStatus: "unknown", usefulLeads: null }));
    const plan = planCalendarFallbacks({ baseSources: [{ id: "base", platform: "PlayStation" }],
      fallbackSources: [{ id: "fallback", platform: "PlayStation" }],
      baseResults: [{ source: { id: "base", platform: "PlayStation" }, status: "empty_or_changed", parserStatus: "unknown", sourceStatus: "success", usefulLeads: 0 }],
      editionDate, now, ledger: { schemaVersion: 1, sources: { fallback: { lastObservedAt: "2026-09-27T04:00:00.000Z", recent } } },
    });
    expect(plan.fallbackDecisions[0].health.class).not.toBe("degraded");
  });

  it("keeps malformed history from rejecting collection or skipping any base source", async () => {
    const report = await collectReleaseCalendar({ config, editionDate, now,
      previousHealth: { schemaVersion: 1, sources: { "playstation-ps5-rss": { lastObservedAt: "2026-09-27T04:00:00.000Z", recent: [null] } } },
      fetcher: async () => empty(),
    });
    expect(report.fallbackTelemetry.baseAttempted).toHaveLength(6);
    expect(report.fallbackTelemetry.actualFallbackAttempts).toContain("playstation-ps5-rss");
  });

  it("classifies repeated known zero-lead observations as degraded even when fetch and parsing succeeded", () => {
    const recent = Array.from({ length: 5 }, () => ({ fetchStatus: "success", parserStatus: "success", usefulLeads: 0 }));
    const plan = planCalendarFallbacks({ baseSources: [{ id: "base", platform: "PlayStation" }],
      fallbackSources: [{ id: "fallback", platform: "PlayStation" }],
      baseResults: [{ source: { id: "base", platform: "PlayStation" }, status: "empty_or_changed", parserStatus: "unknown", sourceStatus: "success", usefulLeads: 0 }],
      editionDate, now, ledger: { schemaVersion: 1, sources: { fallback: { lastObservedAt: "2026-09-27T04:00:00.000Z", recent } } },
    });
    expect(plan.fallbackDecisions[0]).toMatchObject({ attempted: false, health: { class: "degraded", reason: "repeated_known_zero_leads" } });
  });

  it("does not let an older useful lead hide two latest known zero-lead observations", () => {
    const recent = [{ fetchStatus: "success", parserStatus: "success", usefulLeads: 1 },
      { fetchStatus: "success", parserStatus: "success", usefulLeads: 0 },
      { fetchStatus: "success", parserStatus: "success", usefulLeads: 0 }];
    const plan = planCalendarFallbacks({ baseSources: [{ id: "base", platform: "PlayStation" }],
      fallbackSources: [{ id: "fallback", platform: "PlayStation" }],
      baseResults: [{ source: { id: "base", platform: "PlayStation" }, status: "empty_or_changed", parserStatus: "unknown", sourceStatus: "success", usefulLeads: 0 }],
      editionDate, now, ledger: { schemaVersion: 1, sources: { fallback: { lastObservedAt: "2026-09-27T04:00:00.000Z", recent } } },
    });
    expect(plan.fallbackDecisions[0].health.class).toBe("degraded");
  });

  it("retries degraded history every third edition and immediately on a hard base failure", () => {
    const ledger = history("fallback", "bad");
    const baseSources = [{ id: "base", platform: "PlayStation" }];
    const fallbackSources = [{ id: "fallback", platform: "PlayStation" }];
    const emptyBaseResult = { source: baseSources[0], status: "empty_or_changed", parserStatus: "unknown", sourceStatus: "success", usefulLeads: 0 };
    const args = { baseSources, fallbackSources, baseResults: [emptyBaseResult], ledger, now };
    const ordinary = planCalendarFallbacks({ ...args, editionDate: "2026-09-28" });
    const periodic = planCalendarFallbacks({ ...args, editionDate: "2026-09-30" });
    const hardFailure = planCalendarFallbacks({ ...args, editionDate: "2026-09-28", baseResults: [{ ...emptyBaseResult, sourceStatus: "failed" }] });
    expect(ordinary.fallbackDecisions[0].attempted).toBe(false);
    expect(periodic.fallbackDecisions[0]).toMatchObject({ attempted: true, reason: "degraded_history_periodic_or_base_failure_probe" });
    expect(hardFailure.fallbackDecisions[0]).toMatchObject({ attempted: true, reason: "degraded_history_periodic_or_base_failure_probe" });
  });

  it("keeps a valid fallback lead when another fallback source is malformed", async () => {
    const report = await collectReleaseCalendar({ config, editionDate, now, fetcher: async url => {
      if (url.endsWith("/ps")) return new Response('<rss><channel><item><title>PS5 Game launches September 10, 2026</title><link>https://blog.example/ps5-game</link><pubDate>Fri, 25 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>');
      if (url.endsWith("/xbox")) throw new Error("malformed fallback response");
      return empty();
    } });
    const ps = report.coverage.find(item => item.sourceId === "playstation-ps5-rss");
    expect(ps).toMatchObject({ role: "fallback", pagesAttempted: 1, pagesSucceeded: 1, pagesFailed: 0, status: "partial" });
    expect(report.candidates).toEqual([]);
    expect(report.reviewLinks.some(link => link.url === "https://blog.example/ps5-game")).toBe(true);
    expect(report.coverage.find(item => item.sourceId === "xbox-official-rss")).toMatchObject({ role: "fallback", status: "failed", sourceStatus: "failed" });
  });
});
