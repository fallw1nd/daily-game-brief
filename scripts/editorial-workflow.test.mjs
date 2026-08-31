import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");
const editorialize = await readFile("scripts/editorialize.mjs", "utf8");

describe("final editorial packet workflow", () => {
  it("collects once at the Daily 10:10 Beijing evidence cutoff", () => {
    expect(workflow).toContain('- cron: "10 2 * * *"');
    expect(workflow).not.toContain('- cron: "0 9 * * *"');
    expect(workflow.match(/- cron:/g)).toHaveLength(1);
    expect(workflow).not.toContain('cron: "55 1 * * *"');
    expect(workflow).not.toContain('cron: "45 8 * * *"');
  });

  it("accepts only an exact Daily editorial-branch wake signal with shell-safe validation", () => {
    expect(workflow).toContain('branches:\n      - "automation/editorial/*-daily"');
    expect(workflow).toContain('paths:\n      - "automation/wake/*.json"');
    expect(workflow).toContain('edition="${GITHUB_REF_NAME#automation/editorial/}"');
    expect(workflow).toContain('wake_path="automation/wake/$edition.json"');
    expect(workflow).toContain('EDITION_ID="$edition" node -e');
    expect(workflow).not.toContain('EDITION_ID="$edition" node - <<\'NODE\'');
    expect(workflow).toContain("wake.schemaVersion !== 1");
    expect(workflow).toContain('wake.period !== "daily"');
    expect(workflow).toContain('new Set(["packet_missing_at_handoff", "user_authorized_same_edition_revision"])');
    expect(workflow).toContain('state.revisionRequest?.status !== "open"');
    expect(workflow).toContain('state.packet?.status !== "pending"');
    expect(workflow).toContain('--edition="$edition"');
    expect(workflow).toContain("steps.edition.outcome == 'success'");
  });

  it("dispatches exact-edition SLA verification without requiring a checkout, except for authorized revision", () => {
    expect(workflow).toContain('GH_REPO: ${{ github.repository }}');
    expect(workflow).toContain("gh workflow run brief-sla-watchdog.yml");
    expect(workflow).toContain('-f period="${{ needs.collect.outputs.period }}"');
    expect(workflow).toContain('-f edition="${{ needs.collect.outputs.edition }}"');
    expect(workflow).toContain("needs.collect.outputs.revision_authorized != 'true'");
  });

  it("builds bounded title-only hints after evidence and before editorialization", () => {
    const evidenceIndex = workflow.indexOf("- name: Build bounded evidence packages");
    const hintIndex = workflow.indexOf("- name: Build title-only hints");
    const editorialIndex = workflow.indexOf("- name: Build bounded editorial request");
    expect(evidenceIndex).toBeGreaterThan(-1);
    expect(hintIndex).toBeGreaterThan(evidenceIndex);
    expect(editorialIndex).toBeGreaterThan(hintIndex);
    expect(workflow).toContain('DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}');
    expect(workflow).toContain("run: node scripts/build-title-hints.mjs");
    expect(workflow).toContain("artifacts/title-hints.json");
    expect(workflow).toContain("Title hint sources are naming evidence only");
  });

  it("emits the active bilingual contract while keeping English non-blocking", () => {
    expect(editorialize).toContain('"输出 contractVersion=2。');
    expect(editorialize).toContain("每个 include 决定必须填写完整 sharedFactFrame");
    expect(editorialize).toContain("如果无法在事实边界内可靠完成完整英文稿，可以省略 locales.en");
    expect(editorialize).toContain("outputSchema: editorialSchema");
    expect(editorialize).not.toContain("legacyCompatibleEditorialSchema");
  });
});
