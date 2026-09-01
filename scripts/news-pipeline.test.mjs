import { describe, expect, it } from "vitest";
import {
  latestDueWindow,
  mergeCandidates,
  eventIdentity,
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

  it("recognizes Chinese review-score openings as a material event", () => {
    const onimusha = eventIdentity("《鬼武者：剑之道》M站PC均分85！媒体评分解禁");
    const dawnwalker = eventIdentity("《黎明行者之血》M站均分84！《巫师4》代餐来了");
    expect(onimusha).toMatchObject({ eventKind: "review-score", subjectKey: "鬼武者 剑之道" });
    expect(dawnwalker).toMatchObject({ eventKind: "review-score", subjectKey: "黎明行者之血" });
  });

  it("keeps a score-opening report reviewable when an HTML listing lacks an exact timestamp", () => {
    const [candidate] = mergeCandidates([{
      headline: "《黎明行者之血》M站均分84！《巫师4》代餐来了",
      url: "https://example.com/dawnwalker-score",
      summary: "",
      publishedAt: null,
      source: {
        id: "discovery-media",
        label: "Discovery Media",
        group: "discovery",
        independenceKey: "discovery-media",
        priority: 68,
      },
    }]);
    expect(candidate.eventKind).toBe("review-score");
    expect(candidate.score).toBeGreaterThanOrEqual(80);
    expect(candidate.tier).toBe("B");
  });

  it("recognizes explicit English and Japanese score-opening language without elevating an ordinary review", () => {
    expect(eventIdentity("Onimusha: Way of the Sword review scores are live on Metacritic").eventKind).toBe("review-score");
    expect(eventIdentity("『Game X』レビュー解禁、メタスコア85").eventKind).toBe("review-score");
    expect(eventIdentity("Onimusha: Way of the Sword Review").eventKind).toBe("other");
  });

  it("clusters differently worded reports around a quoted subject and event", () => {
    const first = eventIdentity("《Game X》公布发售日");
    const second = eventIdentity("《Game X》发售日正式公开");
    expect(first.eventKey).toBe(second.eventKey);
    expect(first.eventKind).toBe("release-date");
  });

  it("clusters conservative English headline variants across independent sources", () => {
    const candidates = mergeCandidates([
      {
        headline: "Crimson Desert release date announced for November",
        url: "https://example.com/crimson-desert-date",
        summary: "",
        publishedAt: "2026-08-26T01:00:00.000Z",
        source: mediaSource,
      },
      {
        headline: "Crimson Desert release date revealed in new trailer",
        url: "https://second.example/crimson-desert",
        summary: "",
        publishedAt: "2026-08-26T01:05:00.000Z",
        source: { ...mediaSource, id: "second", label: "Second", independenceKey: "second" },
      },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].independentSources).toEqual(["example-media", "second"]);
  });

  it("does not merge different games that share a publisher and event type", () => {
    const candidates = mergeCandidates([
      {
        headline: "Nintendo announces Metroid Prime release date",
        url: "https://example.com/metroid",
        summary: "",
        publishedAt: "2026-08-26T01:00:00.000Z",
        source: mediaSource,
      },
      {
        headline: "Nintendo announces Mario Tennis release date",
        url: "https://second.example/mario",
        summary: "",
        publishedAt: "2026-08-26T01:05:00.000Z",
        source: { ...mediaSource, id: "second", label: "Second", independenceKey: "second" },
      },
    ]);
    expect(candidates).toHaveLength(2);
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

  it("resolves a cross-midnight delayed PM runner to the latest due PM edition", () => {
    const delayed = new Date("2026-08-27T19:56:36.000Z");
    expect(latestDueWindow("pm", delayed)).toMatchObject({
      id: "2026-08-27-pm",
      windowStart: "2026-08-27 10:10",
      windowEnd: "2026-08-27 17:00",
    });
  });

  it("keeps normal cutoff and post-cutoff runs on the current Beijing edition", () => {
    expect(latestDueWindow("am", new Date("2026-08-28T02:10:00.000Z"))).toMatchObject({
      id: "2026-08-28-am",
      windowEnd: "2026-08-28 10:10",
    });
    expect(latestDueWindow("pm", new Date("2026-08-28T09:35:00.000Z"))).toMatchObject({
      id: "2026-08-28-pm",
      windowEnd: "2026-08-28 17:00",
    });
  });

  it("never selects a future same-period edition before its cutoff", () => {
    expect(latestDueWindow("pm", new Date("2026-08-28T07:00:00.000Z"))).toMatchObject({
      id: "2026-08-27-pm",
      windowEnd: "2026-08-27 17:00",
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
