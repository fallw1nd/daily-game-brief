import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");

describe("final editorial packet workflow", () => {
  it("collects at both fixed Beijing cutoffs", () => {
    expect(workflow).toContain('- cron: "10 2 * * *"');
    expect(workflow).toContain('- cron: "0 9 * * *"');
    expect(workflow).not.toContain('cron: "55 1 * * *"');
    expect(workflow).not.toContain('cron: "45 8 * * *"');
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
});
