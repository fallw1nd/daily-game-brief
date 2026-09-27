import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = resolve(process.cwd(), ".github/workflows/secondary-publication.yml");

async function readWorkflow() {
  return readFile(workflowPath, "utf8");
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
