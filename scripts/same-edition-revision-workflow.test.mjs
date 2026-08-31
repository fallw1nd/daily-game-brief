import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const packetWorkflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");
const publisher = await readFile("scripts/publish-editorial-decision.mjs", "utf8");

describe("authorized same-edition revision workflow", () => {
  it("accepts only an explicit revision wake backed by durable state and skips the normal SLA fallback", () => {
    expect(packetWorkflow).toContain('"user_authorized_same_edition_revision"');
    expect(packetWorkflow).toContain('state.revisionRequest?.status !== "open"');
    expect(packetWorkflow).toContain('state.packet?.status !== "pending"');
    expect(packetWorkflow).toContain("revision_authorized: ${{ steps.edition.outputs.revision_authorized }}");
    expect(packetWorkflow).toContain("needs.collect.outputs.revision_authorized != 'true'");
  });

  it("binds publication replacement to the open durable revision and exact immutable packet", () => {
    expect(publisher).toContain('state.revisionRequest?.status === "open"');
    expect(publisher).toContain('state.revisionRequest?.reason === SAME_EDITION_REVISION_REASON');
    expect(publisher).toContain('state.packet?.blobSha === editorial.packetBlobSha');
    expect(publisher).toContain('state.editorial?.packetBlobSha === editorial.packetBlobSha');
    expect(publisher).toContain("allowSameEditionRevision");
  });
});
