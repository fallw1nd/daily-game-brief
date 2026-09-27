import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflowUrl = new URL("../.github/workflows/secondary-publication.yml", import.meta.url);

async function readWorkflow() {
  return readFile(workflowUrl, "utf8");
}

describe("secondary title backfill deployment", () => {
  it("marks whether a title backfill changed production data", async () => {
    const workflow = await readWorkflow();
    expect(workflow).toContain("id: titles");
    expect(workflow).toContain('echo "changed=false" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain('echo "changed=true" >> "$GITHUB_OUTPUT"');
  });

  it("explicitly deploys changed title backfills", async () => {
    const workflow = await readWorkflow();
    expect(workflow).toContain("- name: Deploy title backfill");
    expect(workflow).toContain("steps.titles.outputs.changed == 'true'");
    expect(workflow).toContain("gh workflow run deploy.yml --ref main");
  });
});
