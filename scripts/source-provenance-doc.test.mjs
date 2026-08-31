import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const doc = await readFile("docs/SOURCE_DISCOVERY.md", "utf8");

describe("source discovery documentation", () => {
  it("documents shadow promotion and provenance safety boundaries", () => {
    expect(doc).toContain("机核资讯");
    expect(doc).toContain("UCG 业界论道");
    expect(doc).toContain("The Game Awards News");
    expect(doc).toContain("shadow");
    expect(doc).toContain("does **not** mean the primary page has been opened");
    expect(doc).toContain("multi_source_verified");
  });
});
