import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/secondary-publication.yml", "utf8");
const summary = workflow.split("      - name: Summary\n")[1].split("        run: |\n")[1];

async function runSummary(dispatchOutcome) {
  const directory = await mkdtemp(join(tmpdir(), "secondary-summary-"));
  const output = join(directory, "summary.md");
  const values = {
    "steps.request.outputs.request_id": "2026-10-22-daily",
    "steps.request.outputs.kind": "edition",
    "steps.edition.outputs.edition": "2026-10-22-daily",
    "steps.edition.outputs.recover": "false",
    "steps.publisher_dispatch.outcome": dispatchOutcome,
    "steps.publisher_dispatch.outcome || 'skipped'": dispatchOutcome || "skipped",
    "steps.titles.outputs.changed || 'false'": "false",
  };
  try {
    const script = summary.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) => {
      if (!(expression in values)) throw new Error(`Unexpected workflow expression: ${expression}`);
      return values[expression];
    });
    execFileSync("bash", ["-e", "-c", script], { env: { ...process.env, GITHUB_STEP_SUMMARY: output } });
    return await readFile(output, "utf8");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("secondary publication summary", () => {
  it("identifies the dispatch step whose real outcome is reported", () => {
    expect(workflow).toContain("- name: Dispatch trusted publisher\n        id: publisher_dispatch\n");
  });

  it.each(["failure", "skipped", ""])("does not claim a dispatch succeeded after %s", async (outcome) => {
    const text = await runSummary(outcome);
    expect(text).toContain(`not dispatched successfully (step outcome: ${outcome || "skipped"})`);
    expect(text).not.toContain("dispatch accepted");
  });

  it("distinguishes dispatch acceptance from completed publication", async () => {
    const text = await runSummary("success");
    expect(text).toContain("dispatch accepted after local evidence validation");
    expect(text).toContain("publication/deployment verification remains separate");
    expect(text).not.toContain("not dispatched successfully");
  });
});
