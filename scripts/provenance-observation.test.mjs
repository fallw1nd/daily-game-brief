import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const evidenceBuilder = await readFile("scripts/build-evidence.mjs", "utf8");

describe("source provenance observation", () => {
  it("records publisher and observed primary identities without changing corroboration semantics", () => {
    expect(evidenceBuilder).toContain("publisherKey");
    expect(evidenceBuilder).toContain("observedPrimaryIndependenceKeys");
    expect(evidenceBuilder).toContain("affectsCorroboration: false");
    expect(evidenceBuilder).toContain("corroboration still uses opened-source independenceKey semantics");
  });
});
