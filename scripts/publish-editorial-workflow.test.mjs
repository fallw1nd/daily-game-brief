import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/publish-editorial-decision.yml", "utf8");

describe("trusted bilingual publication workflow", () => {
  it("keeps one trusted publisher and exposes only publish or locale-repair modes", () => {
    expect(workflow).toContain("publication_mode:");
    expect(workflow).toContain("- publish");
    expect(workflow).toContain("- locale-repair");
    expect(workflow).toContain('PUBLICATION_MODE: ${{ steps.submission.outputs.mode }}');
    expect(workflow).not.toContain("english-publisher");
  });

  it("validates the complete publication before staging public data", () => {
    const buildIndex = workflow.indexOf("- name: Build and validate publication");
    const checkIndex = workflow.indexOf("npm run check", buildIndex);
    const publishIndex = workflow.indexOf("- name: Publish atomically");
    const addIndex = workflow.indexOf("git add public/data", publishIndex);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(checkIndex).toBeGreaterThan(buildIndex);
    expect(publishIndex).toBeGreaterThan(checkIndex);
    expect(addIndex).toBeGreaterThan(publishIndex);
  });

  it("does not launch the media workflow for locale-only repair", () => {
    expect(workflow).toContain("steps.submission.outputs.mode == 'publish'");
    expect(workflow).toContain("media-enrichment.yml");
  });

  it("creates a trackable incident for Chinese-first degraded publication", () => {
    expect(workflow).toContain("Record degraded English incident");
    expect(workflow).toContain("locale_status == 'unavailable'");
    expect(workflow).toContain("Canonical Simplified Chinese publication succeeded");
  });
});
