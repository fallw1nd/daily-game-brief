import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const contract = await readFile("docs/SCHEDULED_TASK_PROMPT.md", "utf8");
const architecture = await readFile("docs/AUTOMATION_ARCHITECTURE.md", "utf8");
const packetWorkflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");
const slaWorkflow = await readFile(".github/workflows/brief-sla-watchdog.yml", "utf8");
const mediaWorkflow = await readFile(".github/workflows/media-enrichment.yml", "utf8");
const publisherWorkflow = await readFile(".github/workflows/publish-editorial-decision.yml", "utf8");

describe("Daily scheduled-task orchestration contract", () => {
  it("uses one Daily production task with an hourly-safe second pass", () => {
    expect(contract).toContain("one active long-lived ChatGPT editorial task with two exact Daily invocations at 10:20 and 11:20");
    expect(contract).toContain("fallback is due at 11:40");
    expect(contract).toContain("one active long-lived ChatGPT editorial task");
    expect(contract).toContain("former PM task is disabled");
    expect(contract).toContain("public release is planned for 12:00");
    expect(packetWorkflow).toContain('- cron: "10 2 * * *"');
    expect(slaWorkflow).toContain('- cron: "0 3 * * *"');
    expect(slaWorkflow).toContain('- cron: "40 3 * * *"');
    expect(mediaWorkflow).toContain('- cron: "10 3 * * *"');
    expect(packetWorkflow.match(/- cron:/g)).toHaveLength(1);
    expect(slaWorkflow.match(/- cron:/g)).toHaveLength(2);
    expect(mediaWorkflow.match(/- cron:/g)).toHaveLength(1);
  });

  it("records the first live Daily bridge explicitly", () => {
    expect(contract).toContain("`2026-08-31-daily`");
    expect(contract).toContain("`(2026-08-30 17:00, 2026-08-31 10:10]`");
    expect(contract).toContain("later editions use `(previous day 10:10, current day 10:10]`");
  });

  it("selects oldest pending or invalid work and binds it to one immutable packet", () => {
    const oldest = contract.indexOf("select the oldest already-due Daily edition");
    const state = contract.indexOf("read `automation/status/<edition-id>.json`");
    const blob = contract.indexOf("read the packet by its Git blob SHA");
    expect(oldest).toBeGreaterThan(-1);
    expect(state).toBeGreaterThan(oldest);
    expect(blob).toBeGreaterThan(state);
    expect(contract).toContain("`pending` starts a decision; `invalid` repairs one");
    expect(contract).toContain("durable `validationErrors` and `submissionSha`");
    expect(contract).toContain("Copy it unchanged to `packetBlobSha`");
    expect(contract).toContain("Never skip Canonical backlog or derive its identity from runner time");
    expect(contract).toContain("no `editorial_continuation` or `showcase_completion` request");
  });

  it("keeps current Daily liveness ahead of English repair and allows a later pass", () => {
    expect(contract).toContain("Priority is new Canonical work, current Daily liveness wake, trusted `editorial_continuation`, ready `showcase_completion`, then one English repair");
    expect(contract).toContain("derive the immediate next missing Daily from current `main` before English repair");
    expect(contract).toContain("no acknowledged `packet.status:\"ready\"` for that exact edition");
    expect(contract).toContain("`automation/wake/<edition-id>.json`");
    expect(contract).toContain("`packet_missing_at_handoff`");
    expect(contract).toContain("After the wake commit succeeds, you may use the remainder of this same invocation for at most one continuation that was already acknowledged ready before this wake");
    expect(contract).toContain("never wait for or poll Actions inside the wake invocation");
    expect(contract).toContain("After step 4 proves current liveness is either already healthy or has just been signaled");
    expect(contract).toContain("Do not wait for the just-created wake to become ready");
    expect(contract).toContain("New Canonical work and liveness always outrank both");
    expect(contract).toContain("For `packet.continuation.scope` `news` or `showcase`");
    expect(packetWorkflow).toContain('"automation/editorial/*-daily"');
    expect(packetWorkflow).toContain('"automation/wake/*.json"');
  });

  it("leaves in-flight publication and timeout states to GitHub", () => {
    expect(contract).toContain("`submitted`/`valid` belong to GitHub's publication lane");
    expect(contract).toContain("`timed_out` to its degraded fallback lane");
    expect(contract).toContain("never select or re-edit them");
    expect(contract).toContain("GitHub owns recovery, validation, publication, deployment, state and incidents");
    expect(architecture).toContain("Missing/invalid packet recovery and degraded publication have one owner: GitHub Actions");
  });

  it("bounds same-edition continuation bundles without letting the editor choose identities", () => {
    expect(contract).toContain("up to two same-edition packets");
    expect(contract).toContain("automation/bundle-inbox/<edition-id>.json");
    expect(contract).toContain("preserve each resolved packet SHA, queue batch/event keys and per-packet limits");
    expect(contract).toContain("unprocessed packets remain pending");
    expect(contract).toContain("Never choose a Git blob or event identity yourself");
    expect(architecture).toContain("same-edition bundle");
    expect(architecture).toContain("120,000-character provider-facing input budget");
    expect(architecture).toContain("240,000; the serialized packet/editorial transport envelope has separate 240,000-per-packet and 480,000-per-bundle safety limits");
    expect(architecture).toContain("not a provider token or cost measurement");
    expect(contract).toContain("Later continuations use single inbox");
    expect(contract).toContain("both trusted `main` and the target editorial branch");
    expect(contract).toContain("otherwise use the existing single `automation/inbox/<edition-id>.json` publisher path");
  });

  it("keeps editorial facts bounded while attempting English by default", () => {
    expect(contract).toContain("add nothing outside the packet");
    expect(contract).toContain("Follow live `AGENTS.md` for Chinese names, mainland terminology, sources, time boundaries, copy, and uncertainty");
    expect(contract).toContain("Narrow naming lookups cannot change facts");
    expect(contract).toContain("Never invent a `requires_subject_identity` subject");
    expect(contract).toContain("complete language-neutral `sharedFactFrame`");
    expect(contract).toContain("Attempt complete `locales.en` by default");
    expect(contract).toContain("English is nonblocking, but omission is exceptional");
    expect(contract).toContain("omit `locales.en`");
  });

  it("keeps the evidence frame and targeted validation repairs", () => {
    expect(contract).toContain("Check includes against the immutable packet when drafting");
    expect(contract).toContain("`sharedFactFrame.subjectTitleKey`");
    expect(contract).toContain("`sharedFactFrame.platforms`");
    expect(contract).toContain("must exactly match the Canonical title/platform decision");
    expect(contract).toContain("durable `validationErrors` name a field");
    expect(contract).toContain("repair that field without changing unrelated decisions or adding evidence");
  });

  it("closes stale publication incidents after trusted recovery", () => {
    expect(publisherWorkflow).toContain("Close recovered publication incident");
    expect(publisherWorkflow).toContain("Editorial publication failed: $edition");
    expect(publisherWorkflow).toContain("steps.publication.outcome == 'success'");
    expect(publisherWorkflow).toContain("Recovered by trusted publisher run");
  });

  it("repairs English against final Canonical IDs instead of mutable event keys", () => {
    expect(contract).toContain("Final Canonical `entryId`/order are authoritative");
    expect(contract).toContain("cover each once");
    expect(contract).toContain("`automation/locale/en/<edition-id>`");
    expect(contract).toContain("`automation/locale-inbox/<edition-id>.json`");
    expect(contract).toContain("hash-guards archive/latest/manifest");
    expect(publisherWorkflow).toContain('"automation/locale/en/**"');
    expect(publisherWorkflow).toContain('"automation/locale-inbox/*.json"');
  });

  it("never lets one failure mutate the active task", () => {
    expect(contract).toContain("do not poll Actions");
    expect(contract).toContain("Then stop");
    expect(contract).toContain("A single Canonical or locale failure must never mutate the active Daily task");
  });

  it("stays a thin orchestration prompt", () => {
    expect(contract.split(/\s+/u).length).toBeLessThan(760);
    expect(contract.split(/\r?\n/u).length).toBeLessThan(60);
  });
});
