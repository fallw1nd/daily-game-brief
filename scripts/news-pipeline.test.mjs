import { describe, expect, it } from "vitest";
import {
  mergeCandidates,
  parseFeed,
  parseHtmlLinks,
  plannedWindow,
  resemblesAdjacent,
} from "./lib/news-pipeline.mjs";

const mediaSource = {
  id: "example-media",
  label: "Example Media",
  url: "https://example.com/feed",
  format: "rss",
  group: "media",
  independenceKey: "example-media",
  priority: 80,
};

describe("low-token news discovery pipeline", () => {
  it("extracts RSS and Atom entries without opening article bodies", () => {
    const rss = parseFeed(`
      <rss><channel><item><title><![CDATA[Studio announces Game X release date]]></title>
      <link>https://example.com/game-x?utm_source=rss</link>
      <pubDate>Wed, 26 Aug 2026 01:00:00 GMT</pubDate>
      <description><![CDATA[<p>Short evidence.</p>]]></description></item></channel></rss>`, mediaSource);
    expect(rss).toHaveLength(1);
    expect(rss[0].url).toBe("https://example.com/game-x");
    expect(rss[0].summary).toBe("Short evidence.");
  });

  it("filters HTML links through the configured source pattern", () => {
    const records = parseHtmlLinks(`
      <a href="/news/valid-story">A sufficiently descriptive game news headline</a>
      <a href="/about">About this publication</a>`, {
      ...mediaSource,
      url: "https://example.com/",
      linkPattern: "^https://example\\.com/news/",
    });
    expect(records.map((record) => record.url)).toEqual(["https://example.com/news/valid-story"]);
  });

  it("promotes an official major announcement to the A review queue", () => {
    const [candidate] = mergeCandidates([{
      headline: "Publisher announces Game X release date",
      url: "https://example.com/game-x",
      summary: "",
      publishedAt: "2026-08-26T01:00:00.000Z",
      source: { ...mediaSource, group: "official", priority: 100 },
    }]);
    expect(candidate.tier).toBe("A");
    expect(candidate.score).toBeGreaterThanOrEqual(125);
  });

  it("anchors morning and evening windows to Beijing planned time", () => {
    const now = new Date("2026-08-26T01:50:00.000Z");
    expect(plannedWindow("am", now)).toMatchObject({
      id: "2026-08-26-am",
      windowStart: "2026-08-25 17:00",
      windowEnd: "2026-08-26 10:10",
    });
    expect(plannedWindow("pm", now)).toMatchObject({
      id: "2026-08-26-pm",
      windowStart: "2026-08-26 10:10",
      windowEnd: "2026-08-26 17:00",
    });
  });

  it("marks likely adjacent-edition duplicates before verification", () => {
    const [candidate] = mergeCandidates([{
      headline: "Game X announces a major update",
      url: "https://example.com/game-x-update",
      summary: "",
      publishedAt: null,
      source: mediaSource,
    }]);
    expect(resemblesAdjacent(candidate, [{
      headline: "Game X announces a major update for September",
      title: { title_en: "Game X" },
    }])).toBe(true);
  });
});
