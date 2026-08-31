import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const registry = JSON.parse(await readFile("config/news-sources.json", "utf8"));

describe("refined feed observation boundary", () => {
  it("does not add a new active source", () => {
    const active = registry.sources.filter((source) => (source.mode || "active") === "active").map((source) => source.id);
    expect(active).not.toContain("denfaminico-interviews");
  });
});
