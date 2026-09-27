import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/secondary-publication.yml", "utf8");

describe("secondary same-edition revision resubmission", () => {
  it("allows only a failed open revision bound to the same immutable packet", () => {
    expect(workflow).toContain('state.revisionRequest?.status === "open"');
    expect(workflow).toContain('state.publication?.status === "failed"');
    expect(workflow).toContain('["submitted", "valid", "invalid"].includes(state.editorial?.status)');
    expect(workflow).toContain('state.editorial?.packetBlobSha === process.env.PACKET_SHA');
    expect(workflow).toContain("secondary edition request requires pending editorial state or a failed open revision bound to the same packet");
  });
});
