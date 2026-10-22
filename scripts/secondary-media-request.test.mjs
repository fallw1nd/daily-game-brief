import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { validateSecondaryMediaRequest } from "./validate-secondary-media-request.mjs";

const editionId = "2026-09-02-daily";
const archivePath = `archive/2026/09/${editionId}.json`;
const identity = { id: editionId, date: "2026-09-02", period: "daily", issueNumber: 23 };
const request = { schemaVersion: 1, kind: "media_repair", editionId };
function fixture() {
  return {
    manifest: { editions: [{ ...identity, path: archivePath }] },
    readArchive: vi.fn(() => ({ ...identity, entries: [{ id: "news-item" }], upcoming: [{ id: "release-1" }] })),
  };
}

describe("secondary media repair adapter", () => {
  it("selects only an existing archive and optional existing upcoming record", () => {
    const source = fixture();
    expect(validateSecondaryMediaRequest(request, source)).toEqual({ editionId, recordId: "" });
    expect(source.readArchive).toHaveBeenCalledWith(archivePath);
    expect(validateSecondaryMediaRequest({ ...request, recordId: "release-1" }, source)).toEqual({ editionId, recordId: "release-1" });
  });

  it.each(["unknown", "2026-09-03-daily", "2026-02-30-daily", "2026-13-01-daily", "../2026-09-02-daily", "2026-09-02-daily\ninjected=true", "$(touch bad)"])("rejects unknown/invalid edition %s before archive access", (id) => {
    const source = fixture();
    expect(() => validateSecondaryMediaRequest({ ...request, editionId: id }, source)).toThrow();
    expect(source.readArchive).not.toHaveBeenCalled();
  });

  it.each(["", null, "missing", "news-item", "../release-1", "release-1\ninjected=true"])("rejects invalid or non-upcoming record %s", (recordId) => {
    expect(() => validateSecondaryMediaRequest({ ...request, recordId }, fixture())).toThrow(/recordId/);
  });

  it.each(["metadata", "images", "archiveTitle", "edition_id", "ref", "command"])("rejects unexpected field %s", (field) => {
    const source = fixture();
    expect(() => validateSecondaryMediaRequest({ ...request, [field]: "override" }, source)).toThrow(/unexpected/);
    expect(source.readArchive).not.toHaveBeenCalled();
  });

  it("rejects manifest path/identity mismatches and missing or mismatched archives", () => {
    const source = fixture();
    source.manifest.editions[0].path = "../../secrets.json";
    expect(() => validateSecondaryMediaRequest(request, source)).toThrow(/identity\/path/);
    expect(source.readArchive).not.toHaveBeenCalled();
    const missing = fixture();
    missing.readArchive.mockImplementation(() => { throw new Error("ENOENT"); });
    expect(() => validateSecondaryMediaRequest(request, missing)).toThrow(/ENOENT/);
    const mismatch = fixture();
    mismatch.readArchive.mockReturnValue({ ...identity, issueNumber: 24 });
    expect(() => validateSecondaryMediaRequest(request, mismatch)).toThrow(/archive edition identity/);
    const duplicate = fixture();
    duplicate.manifest.editions.push(duplicate.manifest.editions[0]);
    expect(() => validateSecondaryMediaRequest(request, duplicate)).toThrow(/unique manifest/);
  });

  it("routes the adapter through trusted main with environment-only dispatch inputs", () => {
    const workflow = readFileSync(".github/workflows/secondary-publication.yml", "utf8");
    expect(workflow.indexOf("git checkout --detach origin/main")).toBeLessThan(workflow.indexOf("node scripts/validate-secondary-media-request.mjs"));
    expect(workflow).toContain('^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$');
    expect(workflow).toContain('gh workflow run media-enrichment.yml --ref main \\\n            -f edition_id="$EDITION_ID" -f record_id="$RECORD_ID"');
    expect(workflow).toContain("this is not publication completion");
  });
});
