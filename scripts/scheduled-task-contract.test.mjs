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
  });

  it("records the first live Daily bridge explicitly", () => {
    expect(contract).toContain("`2026-08-31-daily`");
    expect(contract).toContain("`(2026-08-30 17:00, 2026-08-31 10:10]`");
    expect(contract).toContain("later Daily editions use `(previous day 10:10, current day 10:10]`");
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
    expect(contract).toContain("Never skip backlog or derive identity from runner time");
  });

  it("keeps Canonical work ahead of English repair and wake recovery", () => {
    expect(contract).toContain("two bounded lanes in order: current Canonical editorial work first, then at most one published English repair");
    expect(contract).toContain("continue to English repair before considering the missing-packet wake");
    expect(contract).toContain("immediate next missing Daily from current `main`");
    expect(contract).toContain("`automation/wake/<edition-id>.json`");
    expect(contract).toContain("`packet_missing_at_handoff`");
    expect(contract).toContain("Never infer edition from Actions timing or wall-clock date");
    expect(packetWorkflow).toContain('"automation/editorial/*-daily"');
    expect(packetWorkflow).toContain('"automation/wake/*.json"');
  });

  it("leaves in-flight publication and timeout states to GitHub", () => {
    expect(contract).toContain("`submitted`/`valid` belong to GitHub's publication lane");
    expect(contract).toContain("`timed_out` to its SLA lane");
    expect(contract).toContain("never select or re-edit them");
    expect(contract).toContain("GitHub Actions owns collection recovery, validation, trusted publication, deployment, state acknowledgement, and incidents");
    expect(architecture).toContain("Missing/invalid packet recovery and degraded publication have one owner: GitHub Actions");
  });

  it("keeps editorial facts bounded while attempting English by default", () => {
    expect(contract).toContain("add nothing outside the packet");
    expect(contract).toContain("Follow live `AGENTS.md` for Chinese names, mainland terminology, sources, time boundaries, copy, and uncertainty");
    expect(contract).toContain("Narrow naming lookups cannot change facts");
    expect(contract).toContain("Never invent a `requires_subject_identity` subject");
    expect(contract).toContain("complete language-neutral `sharedFactFrame`");
    expect(contract).toContain("attempt complete `locales.en` by default");
    expect(contract).toContain("English is nonblocking, but omission is exceptional");
    expect(contract).toContain("omit `locales.en`");
  });

  it("repairs English against final Canonical IDs instead of mutable event keys", () => {
    expect(contract).toContain("Final Canonical `entryId` and order are authoritative");
    expect(contract).toContain("Each English entry uses final Canonical `entryId`");
    expect(contract).toContain("`automation/locale/en/<edition-id>`");
    expect(contract).toContain("`automation/locale-inbox/<edition-id>.json`");
    expect(contract).toContain("hash-guards archive/latest/manifest");
    expect(publisherWorkflow).toContain('"automation/locale/en/**"');
    expect(publisherWorkflow).toContain('"automation/locale-inbox/*.json"');
  });

  it("never lets one failure mutate the active task", () => {
    expect(contract).toContain("do not poll Actions");
    expect(contract).toContain("Then stop");
    expect(contract).toContain("A single Canonical or locale failure must never pause, disable, rename, reschedule, or otherwise mutate the active Daily task");
  });

  it("stays a thin orchestration prompt", () => {
    expect(contract.split(/\s+/u).length).toBeLessThan(700);
    expect(contract.split(/\r?\n/u).length).toBeLessThan(55);
  });
});
