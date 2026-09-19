import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/publish-editorial-bundle.yml", "utf8");
const runner = await readFile("scripts/run-editorial-bundle.mjs", "utf8");

describe("bounded same-edition editorial bundle workflow", () => {
  it("triggers only for edition-scoped bundle inbox commits", () => {
    expect(workflow).toContain('"automation/editorial/**"');
    expect(workflow).toContain('"automation/bundle-inbox/*.json"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("Exact edition ID whose bounded bundle should be resumed");
    expect(workflow).toContain('git config user.name "daily-game-brief[bot]"');
    expect(workflow).toContain('git config user.email "daily-game-brief[bot]@users.noreply.github.com"');
    expect(workflow).toContain('group: editorial-publication');
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).not.toContain("automation/inbox/");
  });

  it("resolves packet and queue identities from automation/state before publication", () => {
    expect(workflow).toContain("refs/heads/automation/state");
    expect(workflow).toContain("prepare-editorial-bundle.mjs");
    expect(workflow).toContain("EDITORIAL_BUNDLE_PLAN_PATH");
    expect(workflow).toContain("EDITORIAL_BUNDLE_PACKET_DIR");
    expect(workflow).toContain("run-editorial-bundle.mjs");
    expect(workflow).toContain("--no-refresh-sources");
    expect(workflow).toContain("EDITORIAL_BUNDLE_MAX_MS: 720000");
    expect(workflow).toContain("EDITORIAL_BRANCH: ${{ steps.resolve.outputs.branch }}");
    expect(workflow).toContain("if: always() && steps.bundle.outputs.changed == 'true'");
  });

  it("keeps the initial experiment bounded and auditable", () => {
    expect(workflow).toContain("artifacts/editorial-bundle-plan.json");
    expect(workflow).toContain("artifacts/editorial-bundle-result.json");
    expect(runner).toContain('writeBundleResult("partial"');
    expect(runner).toContain("persistOneFeedback");
    expect(workflow).toContain("actions/upload-artifact@v6");
    expect(workflow).toContain("timeout-minutes: 20");
    expect(workflow).toContain("if: always()");
  });
});
