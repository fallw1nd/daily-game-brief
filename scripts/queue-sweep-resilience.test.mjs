import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const script = await readFile("scripts/advance-showcase-queue.mjs", "utf8");

describe("global editorial queue sweep resilience", () => {
  it("isolates a stale historical queue without weakening exact-edition checks", () => {
    expect(script).toContain("if (requestedEdition) throw error;");
    expect(script).toContain("queue advance skipped during global sweep");
    expect(script).toMatch(/try \{\s*result = advanceEditorialQueue\(\{ queue, state, canonical, packets, ledger \}\);\s*\} catch \(error\)/u);
  });
});
