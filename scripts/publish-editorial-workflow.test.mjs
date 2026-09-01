import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/publish-editorial-decision.yml", "utf8");

describe("trusted bilingual publication workflow", () => {
  it("keeps one trusted publisher and exposes publish plus locale-repair modes", () => {
    expect(workflow).toContain("publication_mode:");
    expect(workflow).toContain("- publish");
    expect(workflow).toContain("- locale-repair");
    expect(workflow).toContain('PUBLICATION_MODE: ${{ steps.submission.outputs.mode }}');
    expect(workflow).not.toContain("english-publisher");
  });

  it("accepts bounded locale repair submissions without reopening Canonical editorial state", () => {
    expect(workflow).toContain('"automation/locale/en/**"');
    expect(workflow).toContain('"automation/locale-inbox/*.json"');
    expect(workflow).toContain("node scripts/validate-locale-repair.mjs");
    expect(workflow).toContain("LOCALE_REPAIR_DRAFT_PATH");
    expect(workflow).toContain("Acknowledge repaired English locale");
    expect(workflow).toContain("--status=available");
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

  it("creates and closes trackable English incidents around degradation and repair", () => {
    expect(workflow).toContain("Record degraded English incident");
    expect(workflow).toContain("locale_status == 'unavailable'");
    expect(workflow).toContain("Canonical Simplified Chinese publication succeeded");
    expect(workflow).toContain("Close repaired English incident");
    expect(workflow).toContain("English locale is available after trusted locale repair");
  });

  it("does not misroute locale-repair failures through the Canonical publish retry", () => {
    expect(workflow).toContain("steps.submission.outputs.mode == 'publish'");
    expect(workflow).toContain("not used for locale-only repair");
  });
});
