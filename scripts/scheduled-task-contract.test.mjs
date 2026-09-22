import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const contract = await readFile("docs/SCHEDULED_TASK_PROMPT.md", "utf8");
const architecture = await readFile("docs/AUTOMATION_ARCHITECTURE.md", "utf8");
const packetWorkflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");
const slaWorkflow = await readFile(".github/workflows/brief-sla-watchdog.yml", "utf8");
const mediaWorkflow = await readFile(".github/workflows/media-enrichment.yml", "utf8");
const publisherWorkflow = await readFile(".github/workflows/publish-editorial-decision.yml", "utf8");

describe("Daily scheduled-task contract", () => {
  it("matches the single-task Daily production schedule", () => {
    expect(contract).toContain("one enabled ChatGPT editorial task");
    expect(contract).toContain("10:20 and 11:20");
    expect(contract).toContain("11:40");
    expect(contract).toContain("12:00");
    expect(packetWorkflow).toContain('- cron: "10 2 * * *"');
    expect(slaWorkflow).toContain('- cron: "0 3 * * *"');
    expect(slaWorkflow).toContain('- cron: "40 3 * * *"');
    expect(mediaWorkflow).toContain('- cron: "10 3 * * *"');
  });

  it("binds editing to durable state and one immutable packet", () => {
    expect(contract).toContain("automation/status/<edition-id>.json");
    expect(contract).toContain("packet by its exact Git blob SHA");
    expect(contract).toContain("packetBlobSha");
    expect(contract).toContain("Never edit `submitted`, `valid`, or `timed_out`");
    expect(contract).toContain("add nothing outside the packet");
    expect(contract).toContain("Never invent a `requires_subject_identity` subject");
  });

  it("keeps liveness and continuation identities GitHub-owned", () => {
    expect(contract).toContain('reason:"packet_missing_at_handoff"');
    expect(contract).toContain("Do not wait or poll");
    expect(contract).toContain("Never choose packet or event identity yourself");
    expect(packetWorkflow).toContain('"automation/editorial/*-daily"');
    expect(packetWorkflow).toContain('"automation/wake/*.json"');
    expect(architecture).toContain("GitHub Actions is the durable orchestrator and only trusted publisher");
  });

  it("keeps facts, English, and publication responsibilities separated", () => {
    expect(contract).toContain("complete `sharedFactFrame`");
    expect(contract).toContain("English is nonblocking");
    expect(contract).toContain("Do not calculate issue numbers, final IDs, or digests");
    expect(contract).toContain("do not rediscover or change facts");
    expect(publisherWorkflow).toContain("Close recovered publication incident");
  });

  it("stays concise enough to act as orchestration rather than duplicated documentation", () => {
    expect(contract.split(/\\s+/u).length).toBeLessThan(520);
    expect(contract.split(/\\r?\\n/u).length).toBeLessThan(55);
  });
});
