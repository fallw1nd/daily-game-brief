import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const contract = await readFile("docs/SCHEDULED_TASK_PROMPT.md", "utf8");
const architecture = await readFile("docs/AUTOMATION_ARCHITECTURE.md", "utf8");
const packetWorkflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");
const slaWorkflow = await readFile(".github/workflows/brief-sla-watchdog.yml", "utf8");
const mediaWorkflow = await readFile(".github/workflows/media-enrichment.yml", "utf8");

describe("thin scheduled-task orchestration contract", () => {
  it("keeps handoff times separate from immutable evidence cutoffs", () => {
    expect(contract).toContain("AM at 10:20 and PM at 17:10");
    expect(contract).toContain("evidence cutoffs remain fixed at 10:10 AM and 17:00 PM");
    expect(packetWorkflow).toContain('- cron: "10 2 * * *"');
    expect(packetWorkflow).toContain('- cron: "0 9 * * *"');
    expect(slaWorkflow).toContain('- cron: "0 3 * * *"');
    expect(slaWorkflow).toContain('- cron: "50 9 * * *"');
    expect(mediaWorkflow).toContain('- cron: "10 3 * * *"');
    expect(mediaWorkflow).toContain('- cron: "0 10 * * *"');
  });

  it("selects oldest backlog and binds the decision to an immutable packet blob", () => {
    const oldest = contract.indexOf("select the oldest already-due edition");
    const state = contract.indexOf("Read `automation/status/<edition-id>.json`");
    const blob = contract.indexOf("Read the packet by that Git blob SHA");
    const liveRules = contract.indexOf("Only after the packet passes preflight");
    expect(oldest).toBeGreaterThan(-1);
    expect(state).toBeGreaterThan(oldest);
    expect(blob).toBeGreaterThan(state);
    expect(liveRules).toBeGreaterThan(blob);
    expect(contract).toContain("Copy the SHA unchanged to decision field `packetBlobSha`");
    expect(contract).toContain("Never skip backlog or derive the edition from actual runtime");
  });

  it("leaves recovery and publication exclusively to GitHub Actions", () => {
    expect(contract).toContain("Do not inspect or poll Actions, dispatch recovery, create or delete workflow files, edit `automation/state`, publish content, advance to another edition");
    expect(contract).toContain("GitHub Actions alone owns packet recovery, validation, publication, deployment, and incidents");
    expect(contract).not.toContain("one-shot workflow");
    expect(architecture).toContain("Missing/invalid packet recovery and degraded publication have one owner: GitHub Actions");
  });

  it("keeps exact identity visible and adds event-driven delayed SLA verification", () => {
    expect(packetWorkflow).toContain("run-name: Final editorial packet ·");
    expect(packetWorkflow).toContain("cancel-in-progress: false");
    expect(packetWorkflow).toContain("verify-after-handoff:");
    expect(packetWorkflow).toContain("gh workflow run brief-sla-watchdog.yml");
    expect(packetWorkflow).toContain('-f edition="${{ needs.collect.outputs.edition }}"');
    expect(packetWorkflow).toMatch(/edition:\r?\n\s+description:[^\r\n]+\r?\n\s+required: true/);
  });

  it("keeps editorial facts bounded while delegating duplicated detail to live rules", () => {
    expect(contract).toContain("Do not add events outside the packet");
    expect(contract).toContain("Follow live `AGENTS.md` for Chinese titles, mainland Simplified Chinese terminology, source rules, time boundaries, visible copy, and uncertainty");
    expect(contract).toContain("they cannot add or change event facts");
    expect(contract).toContain("`requires_subject_identity` cannot be included by inventing a game/title identity");
    expect(contract).not.toContain("Resolve game Chinese names in this strict order");
  });

  it("requires the hard Canonical handoff while keeping English optional", () => {
    expect(contract).toContain("must use `contractVersion:2` and the exact `packetBlobSha`");
    expect(contract).toContain("Every included item needs a complete `sharedFactFrame`");
    expect(contract).toContain("English is optional and nonblocking");
    expect(contract).toContain("otherwise omit it");
    expect(contract).toContain("Never weaken or suppress the Simplified Chinese Canonical decision");
  });

  it("never lets a single run mutate either long-lived task", () => {
    expect(contract).toContain("A failure in this run must never pause, disable, rename, reschedule, or otherwise mutate either long-lived ChatGPT task");
    expect(contract).toContain("After the decision commit succeeds");
    expect(contract).toContain("then stop");
  });

  it("stays a thin orchestration prompt", () => {
    expect(contract.split(/\s+/u).length).toBeLessThan(500);
    expect(contract.split(/\r?\n/u).length).toBeLessThan(45);
  });
});
