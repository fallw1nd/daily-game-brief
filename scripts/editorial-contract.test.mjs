import { describe, expect, it } from "vitest";
import { buildEditorialInput, validateEditorialOutput } from "./lib/editorial-contract.mjs";

const evidence = {
  window: { id: "2026-08-26-pm" },
  adjacentEdition: "2026-08-26-am",
  packages: [{
    eventKey: "event-1",
    eventKind: "announcement",
    subjectKey: "example game",
    headline: "Example Game announced",
    tier: "A",
    score: 140,
    timeRelation: "window",
    readiness: "primary-plus-independent",
    sources: [{
      status: "opened",
      kind: "primary",
      independenceKey: "publisher",
      label: "Publisher",
      url: "https://publisher.example/news",
      evidenceText: "Publisher announced Example Game.",
    }],
  }],
};

describe("editorial API contract", () => {
  it("drops limited pages and stays inside the character budget", () => {
    const input = buildEditorialInput({
      ...evidence,
      packages: [{
        ...evidence.packages[0],
        sources: [...evidence.packages[0].sources, { status: "limited", error: "HTTP 403" }],
      }],
    }, 2000);
    expect(input.packages).toHaveLength(1);
    expect(input.packages[0].sources).toHaveLength(1);
    expect(input.budget.usedInputChars).toBeLessThanOrEqual(2000);
  });

  it("rejects official status without opened primary evidence", () => {
    const input = buildEditorialInput({
      ...evidence,
      packages: [{
        ...evidence.packages[0],
        sources: [{ ...evidence.packages[0].sources[0], kind: "secondary" }],
      }],
    });
    const errors = validateEditorialOutput({ decisions: [{
      eventKey: "event-1",
      decision: "include",
      section: "news",
      titleKey: "example-game",
      titleZhCn: null,
      titleEn: "Example Game",
      titleZhStatus: "unavailable",
      headline: "《Example Game》公布",
      summary: "证据摘要。",
      factStatus: "official",
      timeStatus: "verified",
      entryFlags: [],
      tracking: false,
      verification: "媒体报道。",
      reason: "具备新闻价值。",
    }] }, input);
    expect(errors).toContain("decisions[0]: official requires opened primary evidence");
  });

  it("requires tracking for unconfirmed decisions", () => {
    const input = buildEditorialInput(evidence);
    const errors = validateEditorialOutput({ decisions: [{
      eventKey: "event-1",
      decision: "include",
      section: "rumors",
      titleKey: "example-game",
      titleZhCn: null,
      titleEn: "Example Game",
      titleZhStatus: "unavailable",
      headline: "《Example Game》相关消息待确认",
      summary: "消息尚未获得确认。",
      factStatus: "unconfirmed",
      timeStatus: "time_unverified",
      entryFlags: ["rumor"],
      tracking: false,
      verification: "尚无一手来源。",
      reason: "需要追踪。",
    }] }, input);
    expect(errors).toContain("decisions[0]: unconfirmed requires tracking=true");
  });
});
