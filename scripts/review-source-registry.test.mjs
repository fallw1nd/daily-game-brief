import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const registry = JSON.parse(await readFile("config/news-sources.json", "utf8"));
const byId = new Map(registry.sources.map((source) => [source.id, source]));

describe("major review source registry", () => {
  it("keeps GameSpot directly active for review discovery", () => {
    const source = byId.get("gamespot");
    expect(source?.mode).toBe("active");
    expect(source?.format).toBe("rss");
    expect(source?.reliability).toBe("high");
    expect(source?.capabilities).toContain("reviews");
    expect(source?.independenceKey).toBe("gamespot");
  });

  it("registers IGN as a direct high-reliability review source before promotion", () => {
    const source = byId.get("ign-games");
    expect(source?.url).toBe("https://www.ign.com/rss/articles/feed?tags=games");
    expect(source?.format).toBe("rss");
    expect(source?.mode).toBe("shadow");
    expect(source?.reliability).toBe("high");
    expect(source?.capabilities).toContain("reviews");
    expect(source?.independenceKey).toBe("ign");
    expect(source?.publisherFamily).toBe("ign");
  });
});
