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

  it("keeps all configured filtered sources shadow-only", () => {
    for (const id of Object.keys(filters.sources)) {
      expect(byId.get(id)?.mode).toBe("shadow");
    }
  });

  it("does not apply filters to an unconfigured source", () => {
    const records = [{ headline: "Weekly 4Gamer", url: "https://example.com/story" }];
    expect(filterSourceRecords(records, { id: "unconfigured" }, filters)).toEqual({ records, filteredCount: 0 });
  });
});
