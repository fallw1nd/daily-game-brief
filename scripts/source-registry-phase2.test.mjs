import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const registry = JSON.parse(await readFile("config/news-sources.json", "utf8"));
const byId = new Map(registry.sources.map((source) => [source.id, source]));

describe("phase 2 source registry", () => {
  it("keeps new Chinese deep-content sources shadow-only", () => {
    for (const id of ["gcores-news", "gcores-articles", "ucg-industry", "ucg-reviews"]) {
      expect(byId.get(id)?.mode).toBe("shadow");
    }
    expect(byId.get("gcores-news")?.group).toBe("discovery");
    expect(byId.get("gcores-articles")?.group).toBe("discovery");
    expect(byId.get("ucg-industry")?.reliability).toBe("high");
    expect(byId.get("ucg-reviews")?.capabilities).toContain("reviews");
  });

  it("registers official award sources as primary but shadow-only", () => {
    for (const id of ["the-game-awards-news", "bafta-games-awards", "dice-awards"]) {
      const source = byId.get(id);
      expect(source?.mode).toBe("shadow");
      expect(source?.group).toBe("official");
      expect(source?.reliability).toBe("primary");
      expect(source?.capabilities).toEqual(["awards"]);
      expect(source?.defaultLane).toBe("awards");
    }
  });
});
