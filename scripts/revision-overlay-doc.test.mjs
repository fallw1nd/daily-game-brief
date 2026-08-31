import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const note = await readFile(resolve(process.cwd(), "docs/revision-overlay-note.md"), "utf8");

describe("same-edition revision overlay documentation", () => {
  it("states preservation boundaries", () => {
    expect(note).toContain("preserve previously published entries");
    expect(note).toContain("same `title_key` replaces that entry in place");
    expect(note).toContain("Normal new editions keep the existing full-build");
  });
});
