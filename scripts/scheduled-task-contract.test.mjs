import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const contract = await readFile("docs/SCHEDULED_TASK_PROMPT.md", "utf8");
const architecture = await readFile("docs/AUTOMATION_ARCHITECTURE.md", "utf8");
const inputSection = contract.split("## Editorial decision")[0];
const packetWorkflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");
const slaWorkflow = await readFile(".github/workflows/brief-sla-watchdog.yml", "utf8");
const mediaWorkflow = await readFile(".github/workflows/media-enrichment.yml", "utf8");

describe("scheduled task fast packet preflight contract", () => {
  it("separates editorial handoff time from the fixed evidence cutoff", () => {
    expect(contract).toContain("morning ChatGPT task starts at **10:20 Asia/Shanghai**");
    expect(contract).toContain("evening ChatGPT task starts at **17:10 Asia/Shanghai**");
    expect(contract).toContain("fixed evidence cutoffs remain **10:10 for AM** and **17:00 for PM**");
    expect(contract).toContain("the ten-minute buffer must never widen either evidence window or admit post-cutoff information");
    expect(contract).toContain("Never derive the edition date from the task's actual execution calendar date alone");
    expect(contract).toContain("most recent already-due fixed window for this task's period");
    expect(contract).toContain("otherwise use the previous day's PM");
    expect(contract).toContain("SLA watchdog runs at 11:00/17:50");
    expect(contract).toContain("Scheduled media recovery runs later at 11:10/18:00");

    expect(architecture).toContain("**10:20/17:10 Asia/Shanghai ChatGPT tasks**");
    expect(architecture).toContain("The ten-minute separation is intentional");
    expect(architecture).toContain("It does **not** change Canonical `plannedAt`, the edition ID, or the fixed evidence windows");
    expect(architecture).toContain("most recent already-due fixed cutoff for that period");

    expect(packetWorkflow).toContain('- cron: "10 2 * * *"');
    expect(packetWorkflow).toContain('- cron: "0 9 * * *"');
    expect(slaWorkflow).toContain('- cron: "0 3 * * *"');
    expect(slaWorkflow).toContain('- cron: "50 9 * * *"');
    expect(mediaWorkflow).toContain('- cron: "10 3 * * *"');
    expect(mediaWorkflow).toContain('- cron: "0 10 * * *"');
  });

  it("checks the exact packet before loading full editorial context", () => {
    const exactPacket = inputSection.indexOf("The first GitHub read for an edition must be only `automation/packets/<edition-id>.json`");
    const fullContext = inputSection.indexOf("After a usable packet is available, read current `main`");

    expect(exactPacket).toBeGreaterThan(-1);
    expect(fullContext).toBeGreaterThan(exactPacket);
    expect(inputSection).toContain("Do not read `AGENTS.md`, this contract, `public/data/manifest.json`, `public/data/latest.json`, `config/title-translations.json`, or other editorial inputs before this preflight finishes.");
  });

  it("does not inspect or trigger recovery when the packet is already usable", () => {
    expect(inputSection).toContain("If the exact packet is usable, skip Actions recovery inspection and continue directly to step 6.");
  });

  it("waits only for a proven matching collector without creating a duplicate", () => {
    expect(inputSection).toContain("A run is matching only when its intended period is proven to equal the target period");
    expect(inputSection).toContain("Never infer the period from `created_at`, `run_started_at`, the current Beijing clock, or proximity to the cutoff.");
    expect(inputSection).toContain("A severely delayed opposite-period run is not matching and must be ignored; it must not suppress exact-edition recovery.");
    expect(inputSection).toContain("If the matching current-period run is queued or in progress, do not create a second recovery trigger");
    expect(inputSection).toContain("Do not load manifest/latest/title registry while waiting.");
  });

  it("exposes period identity before collection and isolates opposite-period concurrency", () => {
    expect(packetWorkflow).toContain("run-name: Final editorial packet ·");
    expect(packetWorkflow).toContain("group: news-discovery-state-${{");
    expect(packetWorkflow).toContain("github.event.schedule == '10 2 * * *'");
    expect(packetWorkflow).toContain("'am' || 'pm'");
  });

  it("triggers one-shot recovery only after packet miss and no proven matching collector", () => {
    expect(inputSection).toContain("only when the matching packet is missing/invalid and there is no proven matching current-period collection run queued/in progress, or the matching collection run has failed/cancelled");
    expect(inputSection).toContain("Re-read only the matching packet for up to 15 minutes total from task start.");
    expect(inputSection).toContain("The one-shot workflow must do nothing else");
  });

  it("pins recovery to the exact edition and guards pre-cutoff dispatch", () => {
    expect(inputSection).toContain("-f period=<am|pm> -f edition=<edition-id>");
    expect(inputSection).toContain("more than five minutes before its cutoff fails visibly");
    expect(packetWorkflow).toMatch(/\n\s+edition:\n\s+description: Exact edition ID for recovery/);
    expect(packetWorkflow).toContain("node scripts/resolve-packet-dispatch.mjs");
    expect(packetWorkflow).toContain('BRIEF_NOW="${{ steps.edition.outputs.reference_now }}"');
  });

  it("never lets a single run disable either persistent Scheduled task", () => {
    expect(inputSection).toContain("must never disable, pause, reschedule, rename, or otherwise modify either of the two long-lived ChatGPT Scheduled tasks");
    expect(inputSection).toContain("Stop only the current run and report the blocker.");
    expect(inputSection).toContain("Persistent task state may change only through an explicit user request or an explicit maintenance operation");
  });

  it("prefers official mainland terminology for Chinese games without expanding event evidence", () => {
    expect(contract).toContain("official mainland-China Simplified Chinese channel or site");
    expect(contract).toContain("visible version subtitles, characters/agents, classes/professions, named modes/mechanics");
    expect(contract).toContain("terminology-only lookup");
    expect(contract).toContain("Neither lookup may introduce a new event, fact, time, platform, release claim, source classification, tracking decision, or candidate.");
  });

  it("activates the bilingual handoff without making English a Canonical publication gate", () => {
    expect(contract).toContain("New normal submissions must use `contractVersion:2`");
    expect(contract).toContain("every `include` decision must contain a complete `sharedFactFrame`");
    expect(contract).toContain("English is non-blocking");
    expect(contract).toContain("omit `locales.en` rather than weakening, changing, or suppressing the Canonical Chinese editorial decision");
    expect(contract).toContain("record English as machine-readable `unavailable`");
    expect(contract).toContain("Do not calculate or invent final `entryId`, `factsDigest`, `canonicalCopyDigest`, or `localeDigest`");
  });
});
