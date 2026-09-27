// @vitest-environment node
import { describe, expect, it } from "vitest";
import { collectReleaseCalendar } from "./lib/release-calendar-discovery.mjs";

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
