import { describe, expect, it } from "vitest";
import {
  buildEditorialInput,
  editorialSchema,
  validateEditorialOutput,
  validateEnglishEditorialLocale,
} from "./lib/editorial-contract.mjs";

const evidence = {
  window: {
    id: "2026-08-30-am",
    period: "am",
    plannedAt: "2026-08-30 10:10",
    windowStart: "2026-08-29 17:00",
    windowEnd: "2026-08-30 10:10",
  },
  adjacentEdition: "2026-08-29-pm",
  packages: [{
    eventKey: "event-1",
    eventKind: "announcement",
    subjectKey: "example-game",
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
      declaredLanguage: "en",
      detectedLanguage: "en",
      languageConfidence: "high",
      languageBasis: "html-lang",
    }],
  }],
};

function baseDecision() {
  return {
    editionId: "2026-08-30-am",
    archiveTitle: "早报｜Example Game 公布",
    leadEventKey: "event-1",
    decisions: [{
      eventKey: "event-1",
      decision: "include",
      section: "news",
      titleKey: "example-game",
      titleZhCn: null,
      titleEn: "Example Game",
      titleZhStatus: "unavailable",
      headline: "《Example Game》公布",
      summary: "官方公布了 Example Game。",
      factStatus: "official",
      timeStatus: "date_only",
      entryFlags: [],
      tracking: false,
      verification: "已打开官方来源。",
      reason: "具备新闻价值。",
      beijingTime: null,
      timeNote: "证据支持本期窗口归属。",
      platforms: ["PC"],
      region: "全球",
      releaseType: null,
      sourceIndexes: [0],
      additionalSources: [],
    }],
    upcomingMode: "replace",
    removeUpcomingIds: [],
    upcoming: [],
    checkedExtra: [],
    limitedExtra: [],
    editorialNote: "fixture",
  };
}

function sharedFactFrame() {
  return {
    subjectTitleKey: "example-game",
    dates: [],
    times: [],
    numbers: [],
    platforms: ["PC"],
    peopleAndEntities: ["Publisher"],
    versionsAndTerms: [],
  };
}

describe("bilingual Scheduled Task cutover contract", () => {
  it("keeps finalized packet input at schema v2 while preserving source-language metadata", () => {
    const input = buildEditorialInput(evidence);
    expect(input.schemaVersion).toBe(2);
    expect(input.packages[0].sources[0].detectedLanguage).toBe("en");
  });

  it("requires contractVersion 2 while keeping locales optional for Chinese-first degradation", () => {
    expect(editorialSchema.required).toContain("contractVersion");
    expect(editorialSchema.required).toContain("packetBlobSha");
    expect(editorialSchema.required).not.toContain("locales");
    expect(editorialSchema.properties.decisions.items.required).not.toContain("sharedFactFrame");
  });

  it("rejects pre-cutover normal handoffs that are not bound to a packet blob", () => {
    const input = buildEditorialInput(evidence);
    expect(validateEditorialOutput(baseDecision(), input)).toEqual(expect.arrayContaining([
      "output.contractVersion is required",
      "output.packetBlobSha is required",
    ]));
  });

  it("requires the shared fact frame when contractVersion 2 is selected", () => {
    const input = buildEditorialInput(evidence);
    const bilingual = { ...baseDecision(), contractVersion: 2, packetBlobSha: "1".repeat(40) };
    expect(validateEditorialOutput(bilingual, input)).toContain(
      "decisions[0]: contractVersion 2 include requires a complete sharedFactFrame",
    );
  });

  it("does not let missing English block a valid Canonical decision", () => {
    const input = buildEditorialInput(evidence);
    const bilingual = {
      ...baseDecision(),
      contractVersion: 2,
      packetBlobSha: "1".repeat(40),
      decisions: [{ ...baseDecision().decisions[0], sharedFactFrame: sharedFactFrame() }],
    };
    expect(validateEditorialOutput(bilingual, input)).toEqual([]);
    expect(validateEnglishEditorialLocale(bilingual)).toEqual([]);
  });
});
