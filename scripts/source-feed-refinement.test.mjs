import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const registry = JSON.parse(await readFile("config/news-sources.json", "utf8"));
const byId = new Map(registry.sources.map((source) => [source.id, source]));

describe("selective source promotion after runner observation", () => {
  it("keeps the technically validated active cohort bounded", () => {
    expect(registry.sources.filter((source) => (source.mode || "active") === "active")).toHaveLength(19);

    const promotedFeeds = new Map([
      ["4gamer-topics", "https://www.4gamer.net/rss/news_topics.xml"],
      ["4gamer-interview", "https://www.4gamer.net/rss/all_interview.xml"],
      ["4gamer-review", "https://www.4gamer.net/rss/all_review.xml"],
      ["vgc-news", "https://www.videogameschronicle.com/category/news/feed/"],
      ["game-developer", "https://www.gamedeveloper.com/rss.xml"],
      ["ign-games", "https://www.ign.com/rss/articles/feed?tags=games"],
    ]);

    for (const [id, url] of promotedFeeds) {
      const source = byId.get(id);
      expect(source?.mode).toBe("active");
      expect(source?.format).toBe("rss");
      expect(source?.url).toBe(url);
    }
  });

  it("keeps noisier or timestamp-limited sources in shadow", () => {
    for (const id of [
      "game-watch",
      "denfaminico",
      "denfaminico-interviews",
      "pcgamer-news",
      "gcores-news",
      "gcores-articles",
      "ucg-industry",
      "ucg-reviews",
      "the-game-awards-news",
      "bafta-games-awards",
      "dice-awards",
    ]) {
      expect(byId.get(id)?.mode).toBe("shadow");
    }
  });

  it("corrects Denfami interviews to its real interview archive without creating publisher independence", () => {
    const news = byId.get("denfaminico");
    const interviews = byId.get("denfaminico-interviews");
    expect(news?.url).toBe("https://news.denfaminicogamer.jp/category/news/feed");
    expect(news?.format).toBe("rss");
    expect(interviews?.url).toBe("https://news.denfaminicogamer.jp/category/interview");
    expect(interviews?.format).toBe("html");
    expect(interviews?.linkPattern).toBe("^https://news\\.denfaminicogamer\\.jp/interview/");
    expect(interviews?.capabilities).toEqual(["interviews", "features"]);
    expect(interviews?.defaultLane).toBe("interviews");
    expect(news?.independenceKey).toBe("denfaminicogamer");
    expect(interviews?.independenceKey).toBe("denfaminicogamer");
    expect(news?.publisherFamily).toBe(interviews?.publisherFamily);
  });
});
