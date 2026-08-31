import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const doc = await readFile("docs/SOURCE_DISCOVERY.md", "utf8");

describe("feed-first shadow refinement documentation", () => {
  it("keeps source promotion observational and prevents split feeds from faking corroboration", () => {
    expect(doc).toContain("prefers that feed over broad HTML navigation scraping");
    expect(doc).toContain("same `independenceKey` / `publisherFamily`");
    expect(doc).toContain("never creates false corroboration");
    expect(doc).toContain("cannot automatically promote a source");
  });
});
