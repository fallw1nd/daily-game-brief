// @vitest-environment node
import { describe, expect, it } from "vitest";
import { releaseDate, releaseWindow, parseReleaseSource, collectReleaseCalendar, boundCalendarReport, fetchReleaseSource } from "./lib/release-calendar-discovery.mjs";
const source = (adapter, extra = {}) => ({ id: adapter, family: adapter, adapter, platform: "PC", kind: "primary", priority: 2, url: "https://example.com/" + adapter, ...extra });
const row = (id, title, date) => `<a class="tab_item" data-ds-appid="${id}"><span class="tab_item_name">${title}</span><span class="release_date">${date}</span></a>`;
const settings = (sources) => ({ sources, timeoutMs: 1000, maxResponseBytes: 20000, maxCandidates: 100 });

describe("release discovery", () => {
  it("rejects vague/impossible dates and applies an exact cross-year window", () => {
    expect(releaseDate("Q3 2026", "2026-09-08")).toBeNull();
    expect(releaseDate("Feb 30, 2026", "2026-01-01")).toBeNull();
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
  it("keeps healthy source candidates during outages, filters boundaries, and marks partial coverage", async () => {
    const report = await collectReleaseCalendar({ config: settings([source("steam"), source("nintendo")]), editionDate: "2026-09-08", fetcher: async url => {
      if (url.endsWith("nintendo")) throw new Error("offline");
      return new Response(row(1, "Today", "Sep 8, 2026") + row(2, "Edge", "Sep 23, 2026") + row(3, "Outside", "Sep 24, 2026"));
    } });
    expect(report.candidates.map(r => r.title)).toEqual(["Edge"]);
    expect(report.coverage.map(r => r.status)).toEqual(["partial", "failed"]);
    expect(report.candidates[0].review).toBe("open_primary_source_before_publication");
  });
  it("preserves conflicting dates and reserves console coverage when the PC list grows", async () => {
    const config = settings([source("steam"), source("calendar", { platform: "multiplatform" })]); config.maxCandidates = 2;
    const report = await collectReleaseCalendar({ config, editionDate: "2026-09-08", fetcher: async url => new Response(url.endsWith("steam") ? row(1, "Game", "Sep 9, 2026") + row(1, "Game", "Sep 10, 2026") + row(2, "PC only", "Sep 11, 2026") : '<h3>2026</h3><ul><li>Console (PS5) – September 12</li></ul>') });
    expect(report.candidates.map(r => r.family)).toEqual(["steam", "calendar"]);
    expect(report.candidates[0].dates).toEqual(["2026-09-09", "2026-09-10"]);
    expect(report.omittedCandidates).toBe(1);
    const bounded = boundCalendarReport(report, JSON.stringify(report).length - 1);
    expect(bounded.candidates).toHaveLength(1);
    expect(bounded.omittedCandidates).toBe(2);
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

it("prioritizes a known title without claiming other games are unimportant", async () => {
  const config = settings([source("steam")]); config.maxCandidates = 1;
  const report = await collectReleaseCalendar({ config, editionDate: "2026-09-08", titleRegistry: { translations: { known: { titleEnAliases: ["Known Game"] } } }, fetcher: async () => new Response(row(1, "First by date", "Sep 9, 2026") + row(2, "Known Game", "Sep 22, 2026")) });
  expect(report.candidates[0].title).toBe("Known Game");
  expect(report.omittedCandidates).toBe(1);
});
