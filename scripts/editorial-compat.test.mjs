import { describe, expect, it } from "vitest";
import { buildEditorialInput, editorialSchema, validateEditorialOutput } from "./lib/editorial-contract.mjs";
import {
  legacyCompatibleEditorialInput,
  legacyCompatibleEditorialSchema,
} from "./lib/editorial-compat.mjs";

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

function legacyDecision() {
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

describe("bilingual publisher compatibility envelope", () => {
  it("keeps the finalized packet input at schema v2 while preserving additive language metadata", () => {
    const nextInput = buildEditorialInput(evidence);
    expect(nextInput.schemaVersion).toBe(3);
    const compatible = legacyCompatibleEditorialInput(nextInput);
    expect(compatible.schemaVersion).toBe(2);
    expect(compatible.packages[0].sources[0].detectedLanguage).toBe("en");
  });

  it("makes bilingual handoff fields optional until the Scheduled Task cutover", () => {
    const compatibleSchema = legacyCompatibleEditorialSchema(editorialSchema);
    expect(compatibleSchema.required).not.toContain("contractVersion");
    expect(compatibleSchema.required).not.toContain("locales");
    expect(compatibleSchema.properties.decisions.items.required).not.toContain("sharedFactFrame");
  });

  it("continues to accept the existing Chinese-only editorial decision", () => {
    const input = legacyCompatibleEditorialInput(buildEditorialInput(evidence));
    expect(validateEditorialOutput(legacyDecision(), input)).toEqual([]);
  });

  it("enforces shared facts and English copy once contractVersion 2 is explicitly selected", () => {
    const input = legacyCompatibleEditorialInput(buildEditorialInput(evidence));
    const bilingual = { ...legacyDecision(), contractVersion: 2 };
    const errors = validateEditorialOutput(bilingual, input);
    expect(errors).toContain("decisions[0]: contractVersion 2 include requires a complete sharedFactFrame");
    expect(errors).toContain("contractVersion 2 requires locales.en schemaVersion=1 and locale=en");
  });
});
