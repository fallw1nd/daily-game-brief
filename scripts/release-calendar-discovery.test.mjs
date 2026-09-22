// @vitest-environment node
import { describe, expect, it } from "vitest";
import { releaseDate, releaseWindow, parseReleaseSource, collectReleaseCalendar, boundCalendarReport, fetchReleaseSource, updateReleaseCalendarHealth } from "./lib/release-calendar-discovery.mjs";
const source = (adapter, extra = {}) => ({ id: adapter, family: adapter, adapter, platform: "PC", kind: "primary", priority: 2, url: "https://example.com/" + adapter, ...extra });
const row = (id, title, date) => `<a class="tab_item" data-ds-appid="${id}"><span class="tab_item_name">${title}</span><span class="release_date">${date}</span></a>`;
const settings = (sources) => ({ sources, timeoutMs: 1000, maxResponseBytes: 20000, maxCandidates: 100, minCandidatesPerPlatform: 0 });

describe("release discovery", () => {
  it("rejects vague/impossible dates, accepts Sept, and applies an exact cross-year window", () => {
    expect(releaseDate("Q3 2026", "2026-09-08")).toBeNull();
    expect(releaseDate("Feb 30, 2026", "2026-01-01")).toBeNull();
    expect(releaseDate("launches Sept 22", "2026-09-08")).toBe("2026-09-22");
    expect(releaseDate("January 2", "2026-12-28")).toBe("2027-01-02");
    expect(releaseWindow("2026-12-28")).toEqual({ startInclusive: "2026-12-29", endInclusive: "2027-01-12" });
  });

  it("parses storefront identity, retains uncertainty, and excludes demos", () => {
    const result = parseReleaseSource(row(1, "Real Game", "Sep 9, 2026") + row(2, "A Demo", "Sep 9, 2026") + row(3, "Undated", "Coming soon"), source("steam"), "2026-09-08");
    expect(result.records.map(r => r.title)).toEqual(["Real Game", "Undated"]);
    expect(result.records[0].productId).toBe("steam:1");
    expect(result.records[1].date).toBeNull();
  });

  it("deduplicates Nintendo variants without confusing platforms", () => {
    const product = { name: "Known Game", releaseDate: "2026-09-10T00:00:00Z", urlKey: "known-game", nsuid: "123", platform: { label: "Nintendo Switch 2" } };
    const result = parseReleaseSource(`<script id="__NEXT_DATA__">${JSON.stringify({ a: product, b: product })}</script>`, source("nintendo"), "2026-09-08");
    expect(result.records).toHaveLength(1);
    expect(result.records[0].platforms).toEqual(["Nintendo Switch 2"]);
  });

  it("uses month-section years and retains media as discovery only", () => {
    const html = '<h3>SEPTEMBER 2026</h3><ul><li>Known Game (PC, PS5) – September 12</li></ul><h3>2027</h3><ul><li>Later (XSX) - January 2</li></ul>';
    const result = parseReleaseSource(html, source("calendar", { kind: "discovery" }), "2026-09-08");
    expect(result.records.map(r => r.date)).toEqual(["2026-09-12", "2027-01-02"]);
    expect(result.records[0].kind).toBe("discovery");
  });

  it("never substitutes an RSS publication date for a game release date", () => {
    const xml = '<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>Next Week on Xbox</title><link>https://example.com/news</link><pubDate>Fri, 04 Sep 2026 10:00:00 GMT</pubDate><content:encoded><![CDATA[<p><a href="https://example.com/game">Game – September 10</a></p><p><a href="https://example.com/undated">Undated game</a></p>]]></content:encoded></item></channel></rss>';
    const result = parseReleaseSource(xml, source("xbox"), "2026-09-08");
    expect(result.records).toHaveLength(1);
    expect(result.records[0].date).toBe("2026-09-10");
  });

  it("turns an exact-date PlayStation Blog title into a lead but leaves undated articles review-only", () => {
    const xml = '<rss><channel><item><title>Example Game launches Sept 22 on PS5</title><link>https://blog.playstation.com/example</link><pubDate>Fri, 18 Sep 2026 10:00:00 GMT</pubDate><description>details</description></item><item><title>Another Game is coming to PS5</title><link>https://blog.playstation.com/another</link><pubDate>Fri, 18 Sep 2026 10:00:00 GMT</pubDate><description>details</description></item></channel></rss>';
    const result = parseReleaseSource(xml, source("articles", { id: "playstation-blog", family: "playstation", platform: "PlayStation" }), "2026-09-19");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ title: "Example Game", date: "2026-09-22", platforms: ["PlayStation"], leadType: "official_article_title" });
    expect(result.reviewLinks).toHaveLength(2);
  });

  it("keeps healthy source candidates during outages, filters boundaries, and marks partial coverage", async () => {
    const report = await collectReleaseCalendar({ config: settings([source("steam"), source("nintendo")]), editionDate: "2026-09-08", fetcher: async url => {
      if (url.endsWith("nintendo")) throw new Error("offline");
      return new Response(row(1, "Today", "Sep 8, 2026") + row(2, "Edge", "Sep 23, 2026") + row(3, "Outside", "Sep 24, 2026"));
    } });
    expect(report.candidates.map(r => r.title)).toEqual(["Edge"]);
    expect(report.coverage.map(r => r.status)).toEqual(["partial", "failed"]);
    expect(report.platformCoverage.PC.selectedCandidates).toBe(1);
  });

  it("merges the same title/date across stores while preserving platforms and source refs", async () => {
    const config = settings([
      source("steam", { id: "steam", family: "steam", platform: "PC" }),
      source("calendar", { id: "calendar", family: "calendar", platform: "multiplatform", kind: "discovery" }),
    ]);
    const report = await collectReleaseCalendar({ config, editionDate: "2026-09-08", fetcher: async url => new Response(
      url.endsWith("steam")
        ? row(1, "Shared Game", "Sep 12, 2026")
        : '<h3>2026</h3><ul><li>Shared Game (PS5, Xbox Series X) – September 12</li></ul>'
    ) });
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0].platforms).toEqual(expect.arrayContaining(["PC", "PS5", "Xbox Series X"]));
    expect(report.candidates[0].sourceRefs).toHaveLength(2);
    expect(report.candidates[0].crossSource).toBe(true);
    expect(report.omissionStats.duplicateRowsMerged).toBe(1);
  });

  it("reserves candidate coverage for each platform before filling remaining capacity", async () => {
    const config = settings([
      source("steam", { id: "steam", family: "steam", platform: "PC" }),
      source("calendar", { id: "calendar", family: "calendar", platform: "multiplatform", kind: "discovery" }),
    ]);
    config.maxCandidates = 4;
    config.minCandidatesPerPlatform = 1;
    const manyPc = Array.from({ length: 8 }, (_, i) => row(100 + i, `PC ${i}`, "Sep 12, 2026")).join("");
    const cross = '<h3>2026</h3><ul><li>PS Lead (PS5) – September 13</li><li>Xbox Lead (Xbox Series X) – September 14</li><li>Nintendo Lead (Switch 2) – September 15</li></ul>';
    const report = await collectReleaseCalendar({ config, editionDate: "2026-09-08", fetcher: async url => new Response(url.endsWith("steam") ? manyPc : cross) });
    expect(report.candidates).toHaveLength(4);
    expect(report.platformCoverage.PC.selectedCandidates).toBeGreaterThanOrEqual(1);
    expect(report.platformCoverage.PlayStation.selectedCandidates).toBeGreaterThanOrEqual(1);
    expect(report.platformCoverage.Xbox.selectedCandidates).toBeGreaterThanOrEqual(1);
    expect(report.platformCoverage.Nintendo.selectedCandidates).toBeGreaterThanOrEqual(1);
  });

  it("preserves conflicting dates and reports cap versus packet-budget omissions separately", async () => {
    const config = settings([source("steam")]); config.maxCandidates = 2;
    const report = await collectReleaseCalendar({ config, editionDate: "2026-09-08", fetcher: async () => new Response(
      row(1, "Game", "Sep 9, 2026") + row(2, "Game", "Sep 10, 2026") + row(3, "Other", "Sep 11, 2026")
    ) });
    expect(report.candidates.filter(r => r.title === "Game").every(r => r.dateConflict)).toBe(true);
    expect(report.omissionStats.candidateCap).toBe(1);
    const bounded = boundCalendarReport(report, JSON.stringify(boundCalendarReport(report)).length - 1);
    expect(bounded.omissionStats.packetBudget).toBeGreaterThan(0);
    expect(bounded.omittedCandidates).toBe(bounded.omissionStats.candidateCap + bounded.omissionStats.packetBudget);
  });

  it("reports parser drift and rejects oversized responses", async () => {
    const report = await collectReleaseCalendar({ config: settings([source("steam")]), editionDate: "2026-09-08", fetcher: async () => new Response("<h1>Challenge</h1>") });
    expect(report.coverage[0].status).toBe("empty_or_changed");
    await expect(fetchReleaseSource(source("steam"), { timeoutMs: 1000, maxResponseBytes: 5 }, async () => new Response("too much data"))).rejects.toThrow("response too large");
  });
});

it("retains earlier pages when a later storefront request fails", async () => {
  const report = await collectReleaseCalendar({ config: settings([source("steam", { maxPages: 2 })]), editionDate: "2026-09-08", fetcher: async url => {
    if (url.includes("page=2")) throw new Error("page two offline");
    return new Response(row(1, "Surviving result", "Sep 10, 2026"));
  } });
  expect(report.candidates).toHaveLength(1);
  expect(report.coverage[0].status).toBe("partial_failure");
});

it("prioritizes a known title and uses prior source health only as a bounded ranking signal", async () => {
  const config = settings([source("steam"), source("calendar", { id: "calendar", family: "calendar", kind: "discovery", platform: "PC" })]); config.maxCandidates = 1;
  const sourceHealth = { sources: { steam: { usableResponseRateRecent: 1, averageInWindowRecent: 10 }, calendar: { consecutiveFailures: 2 } } };
  const report = await collectReleaseCalendar({
    config,
    editionDate: "2026-09-08",
    titleRegistry: { translations: { known: { titleEnAliases: ["Known Game"] } } },
    sourceHealth,
    fetcher: async url => new Response(url.endsWith("steam") ? row(1, "Known Game", "Sep 22, 2026") : '<h3>2026</h3><ul><li>Other Game (PC) – September 9</li></ul>'),
  });
  expect(report.candidates[0].title).toBe("Known Game");
  expect(report.omittedCandidates).toBe(1);
});

it("persists calendar-specific health without treating HTTP success as usable data", () => {
  const health = updateReleaseCalendarHealth({
    fetchedAt: "2026-09-19T02:00:00.000Z",
    coverage: [
      { sourceId: "good", status: "partial", inWindow: 4, reviewLinks: 0, pages: 1 },
      { sourceId: "empty", status: "empty_or_changed", inWindow: 0, reviewLinks: 0, pages: 1 },
      { sourceId: "failed", status: "failed", inWindow: 0, reviewLinks: 0, pages: 0 },
    ],
  });
  expect(health.sources.good.usableResponseRateRecent).toBe(1);
  expect(health.sources.empty.consecutiveEmptyResponses).toBe(1);
  expect(health.sources.failed.consecutiveFailures).toBe(1);
});
