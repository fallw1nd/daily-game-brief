import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const registry = JSON.parse(await readFile("config/news-sources.json", "utf8"));

describe("shadow feed refinement safety", () => {
  it("does not promote any newly refined source", () => {
    const ids = new Set(["vgc-news", "denfaminico", "denfaminico-interviews", "game-developer", "pcgamer-news"]);
    const selected = registry.sources.filter((source) => ids.has(source.id));
    expect(selected).toHaveLength(ids.size);
    expect(selected.every((source) => source.mode === "shadow")).toBe(true);
  });
});
