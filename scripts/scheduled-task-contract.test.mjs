import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const contract = await readFile("docs/SCHEDULED_TASK_PROMPT.md", "utf8");
const architecture = await readFile("docs/AUTOMATION_ARCHITECTURE.md", "utf8");
const packetWorkflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");
const slaWorkflow = await readFile(".github/workflows/brief-sla-watchdog.yml", "utf8");
const mediaWorkflow = await readFile(".github/workflows/media-enrichment.yml", "utf8");
const publisherWorkflow = await readFile(".github/workflows/publish-editorial-decision.yml", "utf8");

describe("Daily scheduled-task orchestration contract", () => {
  it("uses one Daily production cadence", () => {
    expect(contract).toContain("one active long-lived ChatGPT editorial task: Daily at 10:20");
    expect(contract).toContain("former PM task is disabled");
    expect(contract).toContain("Daily closes evidence at 10:10 and is planned for public release at 12:00");
    expect(packetWorkflow).toContain('- cron: "10 2 * * *"');
    expect(slaWorkflow).toContain('- cron: "0 3 * * *"');
    expect(mediaWorkflow).toContain('- cron: "10 3 * * *"');
    expect(packetWorkflow.match(/- cron:/g)).toHaveLength(1);
    expect(slaWorkflow.match(/- cron:/g)).toHaveLength(1);
    expect(mediaWorkflow.match(/- cron:/g)).toHaveLength(1);
    expect(packetWorkflow).not.toContain('- cron: "0 9 * * *"');
    expect(slaWorkflow).not.toContain('- cron: "50 9 * * *"');
    expect(mediaWorkflow).not.toContain('- cron: "0 10 * * *"');
  });

  it("keeps compatibility inputs without reviving legacy schedules", () => {
    expect(packetWorkflow).toContain("          - am");
    expect(packetWorkflow).toContain("          - pm");
    expect(packetWorkflow).toContain("          - daily");
    expect(slaWorkflow).toContain("          - daily");
    expect(mediaWorkflow).toContain("(am|pm|daily)");
    expect(publisherWorkflow).toContain("(am|pm|daily)");
  });

  it("records the first live Daily bridge explicitly", () => {
    expect(contract).toContain("`2026-08-31-daily`");
    expect(contract).toContain("`(2026-08-30 17:00, 2026-08-31 10:10]`");
    expect(contract).toContain("later Daily editions use `(previous day 10:10, current day 10:10]`");
  });

  it("selects oldest pending or invalid work and binds it to one immutable packet", () => {
    const oldest = contract.indexOf("select the oldest already-due Daily edition");
    const state = contract.indexOf("For normal ready work, read `automation/status/<edition-id>.json`");
    const blob = contract.indexOf("Read the packet by its Git blob SHA");
    expect(oldest).toBeGreaterThan(-1);
    expect(state).toBeGreaterThan(oldest);
    expect(blob).toBeGreaterThan(state);
    expect(contract).toContain("`pending` starts a decision; `invalid` repairs one");
    expect(contract).toContain("durable `validationErrors` and `submissionSha`");
    expect(contract).toContain("same edition and immutable packet");
    expect(contract).toContain("Copy it unchanged to `packetBlobSha`");
    expect(contract).toContain("Never skip backlog or derive identity from runner time");
  });

  it("uses a Daily-only exact wake signal when the acknowledged packet is missing", () => {
    expect(contract).toContain("use one missing-packet wake path only");
    expect(contract).toContain("derive only the immediate next `daily` edition after the latest published Canonical");
    expect(contract).toContain("Never infer the edition from Actions timing or wall-clock date");
    expect(contract).toContain("`automation/wake/<edition-id>.json`");
    expect(contract).toContain('"reason":"packet_missing_at_handoff"');
    expect(contract).toContain("The push only wakes GitHub's exact-edition recovery");
    expect(packetWorkflow).toContain('"automation/editorial/*-daily"');
    expect(packetWorkflow).toContain('"automation/wake/*.json"');
  });

  it("leaves in-flight publication and timeout states to GitHub", () => {
    expect(contract).toContain("`submitted`/`valid` belong to GitHub's publication lane");
    expect(contract).toContain("`timed_out` to its SLA lane");
    expect(contract).toContain("never select or re-edit them");
    expect(contract).toContain("GitHub Actions alone owns collection recovery, validation, publication, deployment, and incidents");
    expect(architecture).toContain("Missing/invalid packet recovery and degraded publication have one owner: GitHub Actions");
  });

  it("checks main Canonical before drafting, branching for a decision, or submitting", () => {
    const preflight = contract.indexOf("After packet preflight");
    const main = contract.indexOf("read current `main`", preflight);
    const canonical = contract.indexOf("If a normal Canonical exists", main);
    const produce = contract.indexOf("## 2. Produce one bounded decision");
    const branch = contract.lastIndexOf("create or reuse `automation/editorial/<edition-id>`");
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

  it("keeps recovery execution and publication exclusively in GitHub Actions", () => {
    expect(contract).toContain("Do not inspect or poll Actions, create/delete workflows, edit `automation/state`, publish, advance editions");
    expect(contract).toContain("bounded Daily wake file above");
    expect(contract).not.toContain("one-shot workflow");
  });

  it("keeps exact identity visible and delayed SLA verification event-driven", () => {
    expect(packetWorkflow).toContain("run-name: Final editorial packet ·");
    expect(packetWorkflow).toContain("cancel-in-progress: false");
    expect(packetWorkflow).toContain("verify-after-handoff:");
    expect(packetWorkflow).toContain("gh workflow run brief-sla-watchdog.yml");
    expect(packetWorkflow).toContain('-f edition="${{ needs.collect.outputs.edition }}"');
    expect(slaWorkflow).toContain("cancel-in-progress: false");
  });

  it("keeps editorial facts bounded while delegating details to live rules", () => {
    expect(contract).toContain("Do not add events outside the packet");
    expect(contract).toContain("Follow live `AGENTS.md` for Chinese titles, mainland terminology, sources, time boundaries, copy, and uncertainty");
    expect(contract).toContain("Narrow naming lookups cannot change facts");
    expect(contract).toContain("Never invent a subject marked `requires_subject_identity`");
  });

  it("requires the Canonical handoff while keeping English optional", () => {
    expect(contract).toContain("Use `contractVersion:2` and the exact `packetBlobSha`");
    expect(contract).toContain("complete language-neutral `sharedFactFrame`");
    expect(contract).toContain("English is optional and nonblocking");
    expect(contract).toContain("omit `locales.en`");
  });

  it("never lets one failure mutate the active task", () => {
    expect(contract).toContain("A single edition failure must never pause, disable, rename, reschedule, or otherwise mutate the active Daily task");
    expect(contract).toContain("After the decision commit succeeds");
    expect(contract).toContain("then stop");
  });

  it("stays a thin orchestration prompt", () => {
    expect(contract.split(/\s+/u).length).toBeLessThan(700);
    expect(contract.split(/\r?\n/u).length).toBeLessThan(55);
  });
});
