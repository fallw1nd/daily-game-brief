import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { filterSourceRecords } from "./lib/source-record-filter.mjs";

const registry = JSON.parse(await readFile("config/news-sources.json", "utf8"));
const filters = JSON.parse(await readFile("config/news-source-filters.json", "utf8"));
const byId = new Map(registry.sources.map((source) => [source.id, source]));

describe("source record filters", () => {
  it("filters configured editorial noise without touching unrelated stories", () => {
    const source = byId.get("4gamer-topics");
    const result = filterSourceRecords([
      { headline: "4Gamerの1週間を振り返る Weekly 4Gamer", url: "https://www.4gamer.net/games/000/G000000/20260831001/" },
      { headline: "新作ゲームの発売日が正式発表", url: "https://www.4gamer.net/games/000/G000000/20260831002/" },
    ], source, filters);
    expect(result.filteredCount).toBe(1);
    expect(result.records.map((item) => item.headline)).toEqual(["新作ゲームの発売日が正式発表"]);
  });

  it("keeps direct IGN reviews while excluding commerce-only feed items", () => {
    const source = byId.get("ign-games");
    const result = filterSourceRecords([
      { headline: "Onimusha: Way of the Sword Review", url: "https://www.ign.com/articles/onimusha-way-of-the-sword-review" },
      { headline: "The Blood of Dawnwalker Review", url: "https://www.ign.com/articles/the-blood-of-dawnwalker-review" },
      { headline: "Best Buy Is Dropping Prices on 2026 Games in Its Labor Day Sale", url: "https://www.ign.com/articles/best-buy-game-deals" },
      { headline: "Grab a Physical Copy for $10 Off Ahead of Launch", url: "https://www.ign.com/articles/pre-order-game-deal" },
    ], source, filters);
    expect(result.filteredCount).toBe(2);
    expect(result.records.map((item) => item.headline)).toEqual([
      "Onimusha: Way of the Sword Review",
      "The Blood of Dawnwalker Review",
    ]);
  });

  it("allows bounded filters to remain attached after selective promotion", () => {
    for (const id of ["4gamer-topics", "ign-games"]) {
      expect(byId.get(id)?.mode).toBe("active");
      expect(filters.sources[id]).toBeTruthy();
    }
    for (const id of ["denfaminico", "pcgamer-news"]) {
      expect(byId.get(id)?.mode).toBe("shadow");
      expect(filters.sources[id]).toBeTruthy();
    }
  });

  it("does not apply filters to an unconfigured source", () => {
    const records = [{ headline: "Weekly 4Gamer", url: "https://example.com/story" }];
    expect(filterSourceRecords(records, { id: "unconfigured" }, filters)).toEqual({ records, filteredCount: 0 });
  });
});
