import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const registry = JSON.parse(await readFile("config/news-sources.json", "utf8"));
const byId = new Map(registry.sources.map((source) => [source.id, source]));

describe("shadow source feed refinements", () => {
  it("keeps production active sources unchanged while moving suitable shadow sources to feeds", () => {
    expect(registry.sources.filter((source) => (source.mode || "active") === "active")).toHaveLength(13);

    const expectedFeeds = new Map([
      ["vgc-news", "https://www.videogameschronicle.com/category/news/feed/"],
      ["denfaminico", "https://news.denfaminicogamer.jp/category/news/feed"],
      ["denfaminico-interviews", "https://news.denfaminicogamer.jp/category/interview/feed"],
      ["game-developer", "https://www.gamedeveloper.com/rss.xml"],
      ["pcgamer-news", "https://www.pcgamer.com/rss/"],
    ]);

    for (const [id, url] of expectedFeeds) {
      const source = byId.get(id);
      expect(source?.mode).toBe("shadow");
      expect(source?.format).toBe("rss");
      expect(source?.url).toBe(url);
      expect(source?.linkPattern).toBeUndefined();
    }
  });

  it("keeps Denfami news and interviews independent as lanes but not as corroborating publishers", () => {
    const news = byId.get("denfaminico");
    const interviews = byId.get("denfaminico-interviews");
    expect(news?.capabilities).toEqual(["news"]);
    expect(interviews?.capabilities).toEqual(["interviews", "features"]);
    expect(interviews?.defaultLane).toBe("interviews");
    expect(news?.independenceKey).toBe("denfaminicogamer");
    expect(interviews?.independenceKey).toBe("denfaminicogamer");
    expect(news?.publisherFamily).toBe(interviews?.publisherFamily);
  });
});
