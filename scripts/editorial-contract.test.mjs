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

  it("forces unresolved ledger tracking into the next editorial input", () => {
    const input = buildEditorialInput({ ...evidence, packages: [] }, 2000, {
      events: {
        "tracked-event": {
          eventKey: "tracked-event", eventKind: "rumor", subjectKey: "tracked game",
          lastHeadline: "Tracked Game report", firstSeenAt: "2026-08-25T01:00:00.000Z",
          lastSeenAt: "2026-08-25T01:00:00.000Z", lastDecisionEdition: "2026-08-25-pm",
          lastDecisionAt: "2026-08-25T09:10:00.000Z", sourceUrls: ["https://media.example/report"],
          tracking: { active: true, reason: "等待发行商确认。" },
        },
      },
    });
    expect(input.trackingQueue.map((item) => item.eventKey)).toEqual(["tracked-event"]);
    expect(input.budget.activeTrackingItems).toBe(1);
    expect(validateEditorialOutput({ decisions: [] }, input)).toContain("missing decision for tracked-event");
  });

  it("requires needs_review decisions to remain tracked", () => {
    const input = buildEditorialInput(evidence);
    const errors = validateEditorialOutput({ decisions: [{
      eventKey: "event-1", decision: "needs_review", section: null,
      titleKey: null, titleZhCn: null, titleEn: null, titleZhStatus: null,
      headline: null, summary: null, factStatus: null, timeStatus: null,
      entryFlags: [], tracking: false, verification: "证据不足。", reason: "等待确认。",
      beijingTime: null, timeNote: null, platforms: [], region: null, releaseType: null,
      sourceIndexes: [], additionalSources: [],
    }] }, input);
    expect(errors).toContain("decisions[0]: needs_review requires tracking=true");
  });
});
