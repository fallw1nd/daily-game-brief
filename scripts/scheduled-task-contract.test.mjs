import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const contract = await readFile("docs/SCHEDULED_TASK_PROMPT.md", "utf8");
const inputSection = contract.split("## Editorial decision")[0];
const packetWorkflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");

describe("scheduled task fast packet preflight contract", () => {
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

  it("waits for an active collector without creating a duplicate", () => {
    expect(inputSection).toContain("If the matching current-period run is queued or in progress, do not create a second recovery trigger");
    expect(inputSection).toContain("Do not load manifest/latest/title registry while waiting.");
  });

  it("triggers one-shot recovery only after packet miss and no active collector", () => {
    expect(inputSection).toContain("only when the matching packet is missing/invalid and there is no current-period collection run queued/in progress, or the matching collection run has failed/cancelled");
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
});
