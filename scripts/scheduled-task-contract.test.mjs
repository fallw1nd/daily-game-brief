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
    expect(contract).toContain("fixed 10:10 AM / 17:00 PM evidence cutoffs");
    expect(packetWorkflow).toContain('- cron: "10 2 * * *"');
    expect(packetWorkflow).toContain('- cron: "0 9 * * *"');
    expect(slaWorkflow).toContain('- cron: "0 3 * * *"');
    expect(slaWorkflow).toContain('- cron: "50 9 * * *"');
    expect(mediaWorkflow).toContain('- cron: "10 3 * * *"');
    expect(mediaWorkflow).toContain('- cron: "0 10 * * *"');
  });

  it("selects oldest pending or invalid work and binds it to one immutable packet", () => {
    const oldest = contract.indexOf("select the oldest already-due edition");
    const state = contract.indexOf("Read `automation/status/<edition-id>.json`");
    const blob = contract.indexOf("Read the packet by its Git blob SHA");
    expect(oldest).toBeGreaterThan(-1);
    expect(state).toBeGreaterThan(oldest);
    expect(blob).toBeGreaterThan(state);
    expect(contract).toContain("`editorial.status` of `pending` or `invalid`");
    expect(contract).toContain("durable `validationErrors` and `submissionSha`");
    expect(contract).toContain("Fix only those errors and consequential consistency in the same edition");
    expect(contract).toContain("Never rediscover events, change packet, or advance");
    expect(contract).toContain("Copy it unchanged to `packetBlobSha`");
    expect(contract).toContain("Never skip backlog or derive identity from runtime");
  });

  it("leaves in-flight publication and timeout states to GitHub", () => {
    expect(contract).toContain("`submitted`/`valid` belong to GitHub's publication lane");
    expect(contract).toContain("`timed_out` to its SLA lane");
    expect(contract).toContain("never select or re-edit them");
    expect(contract).toContain("GitHub Actions alone owns recovery, validation, publication, deployment, and incidents");
    expect(architecture).toContain("Missing/invalid packet recovery and degraded publication have one owner: GitHub Actions");
  });

  it("checks main Canonical before drafting, branching, or submitting", () => {
    const preflight = contract.indexOf("After packet preflight");
    const main = contract.indexOf("read current `main`");
    const canonical = contract.indexOf("If a normal Canonical exists");
    const produce = contract.indexOf("## 2. Produce one bounded decision");
    const branch = contract.indexOf("create or reuse `automation/editorial/<edition-id>`");
    const commit = contract.indexOf("Commit only `automation/inbox/<edition-id>.json`");
    expect(preflight).toBeGreaterThan(-1);
    expect(main).toBeGreaterThan(preflight);
    expect(canonical).toBeGreaterThan(main);
    expect(produce).toBeGreaterThan(canonical);
    expect(branch).toBeGreaterThan(produce);
    expect(commit).toBeGreaterThan(branch);
    expect(contract).toContain("`main` is authoritative even when durable state lags");
    expect(contract).toContain("stop before drafting or submitting");
    expect(contract).toContain("Continue only if absent or `[自动事实清单]`");
    expect(contract).toContain("same degraded edition and issue number");
  });

  it("leaves recovery and publication exclusively to GitHub Actions", () => {
    expect(contract).toContain("Do not inspect or poll Actions, dispatch recovery, create or delete workflows, edit `automation/state`, publish, advance editions");
    expect(contract).not.toContain("one-shot workflow");
  });

  it("keeps exact identity visible and delayed SLA verification event-driven", () => {
    expect(packetWorkflow).toContain("run-name: Final editorial packet ·");
    expect(packetWorkflow).toContain("cancel-in-progress: false");
    expect(packetWorkflow).toContain("verify-after-handoff:");
    expect(packetWorkflow).toContain("gh workflow run brief-sla-watchdog.yml");
    expect(packetWorkflow).toContain('-f edition="${{ needs.collect.outputs.edition }}"');
  });

  it("keeps editorial facts bounded while delegating details to live rules", () => {
    expect(contract).toContain("Do not add events outside the packet");
    expect(contract).toContain("Follow live `AGENTS.md` for Chinese titles, mainland terminology, sources, time boundaries, copy, and uncertainty");
    expect(contract).toContain("narrow naming lookups cannot change facts");
    expect(contract).toContain("Never invent a subject marked `requires_subject_identity`");
    expect(contract).not.toContain("Resolve game Chinese names in this strict order");
  });

  it("requires the Canonical handoff while keeping English optional", () => {
    expect(contract).toContain("Use `contractVersion:2` and the exact `packetBlobSha`");
    expect(contract).toContain("complete language-neutral `sharedFactFrame`");
    expect(contract).toContain("English is optional and nonblocking");
    expect(contract).toContain("otherwise omit it");
    expect(contract).toContain("Never weaken or suppress Simplified Chinese Canonical");
  });

  it("never lets one failure mutate either long-lived task", () => {
    expect(contract).toContain("A failure must never pause, disable, rename, reschedule, or otherwise mutate either long-lived ChatGPT task");
    expect(contract).toContain("After the decision commit succeeds");
    expect(contract).toContain("then stop");
  });

  it("stays a thin orchestration prompt", () => {
    expect(contract.split(/\s+/u).length).toBeLessThan(500);
    expect(contract.split(/\r?\n/u).length).toBeLessThan(45);
  });
});
