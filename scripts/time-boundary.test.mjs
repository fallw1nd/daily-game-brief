import { describe, expect, it } from "vitest";
import { buildEdition } from "./lib/edition-publisher.mjs";
import { validateEditorialOutput } from "./lib/editorial-contract.mjs";
import {
  resolveSelectedTimeEvidence,
  verifiedWindowTimeError,
} from "./lib/time-window.mjs";

const amWindow = {
  id: "2026-08-29-am",
  period: "am",
  plannedAt: "2026-08-29 10:10",
  windowStart: "2026-08-28 17:00",
  windowEnd: "2026-08-29 10:10",
};
const pmWindow = {
  id: "2026-08-29-pm",
  period: "pm",
  plannedAt: "2026-08-29 17:00",
  windowStart: "2026-08-29 10:10",
  windowEnd: "2026-08-29 17:00",
};

function packageFor(publishedAt) {
  return {
    eventKey: "witchs-garden",
    tier: "B",
    timeRelation: "window",
    sources: [{
      sourceIndex: 0,
      status: "opened",
      kind: "secondary",
      independenceKey: "automaton-media",
      label: "AUTOMATON",
      url: "https://automaton-media.com/example",
      canonicalUrl: "https://automaton-media.com/example",
      publishedAt,
      evidenceText: "正式リリース。",
    }],
  };
}

function decision(overrides = {}) {
  return {
    eventKey: "witchs-garden",
    decision: "include",
    section: "releases",
    titleKey: "witchs-garden",
    titleZhCn: null,
    titleEn: "魔女の庭",
    titleZhStatus: "unavailable",
    headline: "《魔女の庭》正式发售",
    summary: "作品结束抢先体验并正式发售。",
    factStatus: "media_report",
    timeStatus: "verified",
    entryFlags: [],
    tracking: false,
    verification: "已打开来源页面。",
    reason: "窗口内正式发售信息。",
    beijingTime: "2026-08-28 17:00",
    timeNote: "来源发布时间处于固定窗口。",
    platforms: ["PC"],
    region: "全球",
    releaseType: "正式发售",
    sourceIndexes: [0],
    additionalSources: [],
    ...overrides,
  };
}

function editorial(decisionItem) {
  return {
    editionId: "2026-08-29-am",
    archiveTitle: "早报｜《魔女の庭》正式发售",
    leadEventKey: "witchs-garden",
    decisions: [decisionItem],
    upcomingMode: "replace",
    removeUpcomingIds: [],
    upcoming: [],
    checkedExtra: [],
    limitedExtra: [],
    editorialNote: "边界时间回归。",
  };
}

describe("second-precision fixed-window boundaries", () => {
  it("accepts the production AM case at 17:00:11 and preserves minute display", () => {
    const packetItem = packageFor("2026-08-28T09:00:11Z");
    const item = decision();
    expect(resolveSelectedTimeEvidence(item, packetItem)).toBe("2026-08-28T09:00:11.000Z");
    expect(verifiedWindowTimeError({
      beijingTime: item.beijingTime,
      timeEvidenceAt: "2026-08-28T09:00:11.000Z",
      windowStart: amWindow.windowStart,
      windowEnd: amWindow.windowEnd,
      requireExactBoundary: true,
    })).toBeNull();

    const result = buildEdition({
      packet: { editorialInput: { window: amWindow, packages: [packetItem] } },
      editorial: editorial(item),
      latest: { id: "2026-08-28-pm", upcoming: [] },
      manifest: { schemaVersion: 1, editions: [{ id: "2026-08-28-pm", issueNumber: 16 }] },
      now: new Date("2026-08-29T05:00:00Z"),
    });
    expect(result.edition.entries[0].beijingTime).toBe("2026-08-28 17:00");
    expect(result.edition.entries[0].timeEvidenceAt).toBe("2026-08-28T09:00:11.000Z");
  });

  it("rejects AM exact start 17:00:00 but accepts 17:00:01", () => {
    expect(verifiedWindowTimeError({
      beijingTime: "2026-08-28 17:00",
      timeEvidenceAt: "2026-08-28T09:00:00.000Z",
      windowStart: amWindow.windowStart,
      windowEnd: amWindow.windowEnd,
      requireExactBoundary: true,
    })).toBe("verified event time falls outside the fixed window");
    expect(verifiedWindowTimeError({
      beijingTime: "2026-08-28 17:00",
      timeEvidenceAt: "2026-08-28T09:00:01.000Z",
      windowStart: amWindow.windowStart,
      windowEnd: amWindow.windowEnd,
      requireExactBoundary: true,
    })).toBeNull();
  });

  it("accepts PM exact end 17:00:00 but rejects 17:00:01", () => {
    expect(verifiedWindowTimeError({
      beijingTime: "2026-08-29 17:00",
      timeEvidenceAt: "2026-08-29T09:00:00.000Z",
      windowStart: pmWindow.windowStart,
      windowEnd: pmWindow.windowEnd,
      requireExactBoundary: true,
    })).toBeNull();
    expect(verifiedWindowTimeError({
      beijingTime: "2026-08-29 17:00",
      timeEvidenceAt: "2026-08-29T09:00:01.000Z",
      windowStart: pmWindow.windowStart,
      windowEnd: pmWindow.windowEnd,
      requireExactBoundary: true,
    })).toBe("verified event time falls outside the fixed window");
  });

  it("applies the same exclusive rule at the PM 10:10 start", () => {
    expect(verifiedWindowTimeError({
      beijingTime: "2026-08-29 10:10",
      timeEvidenceAt: "2026-08-29T02:10:00.000Z",
      windowStart: pmWindow.windowStart,
      windowEnd: pmWindow.windowEnd,
      requireExactBoundary: true,
    })).toBe("verified event time falls outside the fixed window");
    expect(verifiedWindowTimeError({
      beijingTime: "2026-08-29 10:10",
      timeEvidenceAt: "2026-08-29T02:10:01.000Z",
      windowStart: pmWindow.windowStart,
      windowEnd: pmWindow.windowEnd,
      requireExactBoundary: true,
    })).toBeNull();
  });

  it("fails closed for minute-only evidence in a boundary minute", () => {
    const packetItem = packageFor("2026-08-28T09:00Z");
    const item = decision();
    expect(resolveSelectedTimeEvidence(item, packetItem)).toBeNull();
    const input = { window: amWindow, packages: [packetItem], trackingQueue: [] };
    expect(validateEditorialOutput({ decisions: [item] }, input)).toContain(
      "decisions[0]: verified boundary-minute time requires second-precision selected-source evidence",
    );
    expect(() => buildEdition({
      packet: { editorialInput: { window: amWindow, packages: [packetItem] } },
      editorial: editorial(item),
      latest: { id: "2026-08-28-pm", upcoming: [] },
      manifest: { schemaVersion: 1, editions: [{ id: "2026-08-28-pm", issueNumber: 16 }] },
    })).toThrow("verified boundary-minute time requires second-precision selected-source evidence");
  });

  it("keeps time_unverified as the safe fallback when exact boundary evidence is unavailable", () => {
    const packetItem = packageFor("2026-08-28T09:00Z");
    const item = decision({ timeStatus: "time_unverified", beijingTime: null });
    const input = { window: amWindow, packages: [packetItem], trackingQueue: [] };
    expect(validateEditorialOutput({ decisions: [item] }, input)).not.toContain(
      "decisions[0]: verified boundary-minute time requires second-precision selected-source evidence",
    );
  });
});
