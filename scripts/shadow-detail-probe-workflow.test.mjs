import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const observer = await readFile(".github/workflows/source-shadow-observation.yml", "utf8");
const production = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");

describe("shadow detail timestamp probe isolation", () => {
  it("runs only from the read-only observer workflow", () => {
    expect(observer).toContain("probe-shadow-published-time.mjs");
    expect(production).not.toContain("probe-shadow-published-time.mjs");
    expect(production).not.toContain("SHADOW_DETAIL_MAX_PER_SOURCE");
    expect(production).not.toContain("SHADOW_DETAIL_MAX_TOTAL");
  });
});
