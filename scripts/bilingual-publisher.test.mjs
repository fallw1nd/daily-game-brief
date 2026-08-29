import { describe, expect, it } from "vitest";
import {
  buildEnglishOverlay,
  buildLocaleUnavailableStatus,
  deriveEntryIdsByEvent,
} from "./lib/bilingual-publisher.mjs";
import { editorialDecisionDigest, factsDigest } from "./lib/locale-digest.mjs";

function canonicalEdition() {
  return {
    schemaVersion: 2,
    id: "2026-08-30-am",
    issueNumber: 19,
    date: "2026-08-30",
    period: "am",
    plannedAt: "2026-08-30 10:10",
    generatedAt: "2026-08-30 10:11",
    windowStart: "2026-08-29 17:00",
    windowEnd: "2026-08-30 10:10",
    timezone: "Asia/Shanghai",
    nextEditionAt: "2026-08-30 17:00",
    revised: false,
    archiveTitle: "早报｜测试游戏公布新版本",
    leadEntryId: "2026-08-30-am-news-0",
    entries: [{
      id: "2026-08-30-am-news-0",
      section: "news",
      title: { title_key: "test-game", title_en: "Test Game", title_zh_cn: "测试游戏", title_zh_status: "official_simplified" },
      headline: "《测试游戏》公布新版本",
      summary: "官方公布了新版本，并确认将在既定平台推出。",
      beijingTime: "2026-08-30 09:00",
      timeNote: "官方页面时间位于本期固定窗口内。",
      fact_status: "official",
      time_status: "verified",
      entry_flags: [],
      platforms: ["PC"],
      region: "Global",
      releaseType: "Version update",
      sources: [{ label: "Official website", url: "https://example.com/news", kind: "primary" }],
      verification: "已打开官方来源并核对事件、平台与时间。",
      tracking: false,
      sharedFactFrameDigest: `sha256:${"1".repeat(64)}`,
      imageSeed: "test-game",
      image_status: "unavailable",
      imageNote: "fixture",
    }],
    upcoming: [],
    tracking: [],
    sourceReport: { checked: ["fixture"], limited: [], note: "fixture" },
  };
}

function bilingualEditorial() {
  return {
    contractVersion: 2,
    editionId: "2026-08-30-am",
    archiveTitle: "早报｜测试游戏公布新版本",
    leadEventKey: "event-test-game",
    decisions: [{
      eventKey: "event-test-game",
      decision: "include",
      section: "news",
      titleKey: "test-game",
      platforms: ["PC"],
      sharedFactFrame: {
        subjectTitleKey: "test-game",
        dates: ["2026-08-30"], times: [], numbers: [], platforms: ["PC"], peopleAndEntities: [], versionsAndTerms: ["Version update"],
      },
    }],
    upcoming: [],
    locales: {
      en: {
        schemaVersion: 1,
        locale: "en",
        archiveTitle: "Morning Brief | Test Game Announces a New Version",
        entries: [{
          eventKey: "event-test-game",
          headline: "Test Game Announces a New Version",
          summary: "The official source confirms a new version for the already verified platform set.",
          verification: "The official page was opened and supports the event, platform and timing stated here.",
          timeNote: "The official page timestamp falls within the fixed Beijing-time edition window.",
          regionLabel: null,
          releaseTypeLabel: null,
          sourceLabels: [],
        }],
        upcoming: [],
        sourceReport: null,
      },
    },
  };
}

describe("trusted bilingual publication planner", () => {
  it("binds English event keys to canonical entry IDs and computes reproducible digests", () => {
    const canonical = canonicalEdition();
    const editorial = bilingualEditorial();
    const ids = deriveEntryIdsByEvent(editorial);
    expect(ids).toEqual({ "event-test-game": "2026-08-30-am-news-0" });
    const result = buildEnglishOverlay({ canonical, editorial, entryIdsByEvent: ids });
    expect(result.status).toBe("available");
    expect(result.overlay.entries[0].entryId).toBe(canonical.entries[0].id);
    expect(result.overlay.factsDigest).toBe(factsDigest(canonical));
    expect(result.overlay.localeDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("degrades Chinese-first publication with a machine-readable unavailable state", () => {
    const canonical = canonicalEdition();
    const editorial = { ...bilingualEditorial(), locales: undefined };
    const result = buildEnglishOverlay({ canonical, editorial, entryIdsByEvent: deriveEntryIdsByEvent(editorial) });
    expect(result.status).toBe("unavailable");
    expect(result.reasonCode).toBe("editorial-overlay-missing");
    const status = buildLocaleUnavailableStatus({ canonical, reasonCode: result.reasonCode, summary: result.summary });
    expect(status.factsDigest).toBe(factsDigest(canonical));
    expect(status.editionId).toBe(canonical.id);
  });

  it("keeps editorial decision identity unchanged when only English copy changes", () => {
    const editorial = bilingualEditorial();
    const changed = structuredClone(editorial);
    changed.locales.en.entries[0].headline = "Test Game Details Its New Version";
    expect(editorialDecisionDigest(changed)).toBe(editorialDecisionDigest(editorial));
  });

  it("is deterministic for locale repair and does not mutate canonical data", () => {
    const canonical = canonicalEdition();
    const before = JSON.stringify(canonical);
    const editorial = bilingualEditorial();
    const first = buildEnglishOverlay({ canonical, editorial, entryIdsByEvent: deriveEntryIdsByEvent(editorial) });
    const second = buildEnglishOverlay({ canonical, editorial, entryIdsByEvent: deriveEntryIdsByEvent(editorial) });
    expect(JSON.stringify(first.overlay)).toBe(JSON.stringify(second.overlay));
    expect(JSON.stringify(canonical)).toBe(before);
  });

  it("rejects invalid English rather than publishing a partial mixed-language overlay", () => {
    const canonical = canonicalEdition();
    const editorial = bilingualEditorial();
    editorial.locales.en.entries[0].summary = "这是整段中文占位文本，不能进入英文页面。";
    const result = buildEnglishOverlay({ canonical, editorial, entryIdsByEvent: deriveEntryIdsByEvent(editorial) });
    expect(result.status).toBe("unavailable");
    expect(result.reasonCode).toBe("editorial-overlay-invalid");
    expect(result.summary).toContain("English overlay rejected");
  });
});
