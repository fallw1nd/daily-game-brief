import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const registry = JSON.parse(await readFile("config/news-sources.json", "utf8"));

describe("source refinement production boundary", () => {
  it("keeps the existing production source count at thirteen", () => {
    expect(registry.sources.filter((source) => (source.mode || "active") === "active")).toHaveLength(13);
  });
});
