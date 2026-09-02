import { describe, expect, it } from "vitest";
import { buildEnglishOverlay } from "./lib/bilingual-publisher.mjs";

function canonicalEntry(id, titleKey) {
  return {
    id,
    section: "news",
    title: {
      title_key: titleKey,
      title_en: titleKey,
      title_zh_status: "unavailable",
    },
    headline: `Canonical ${titleKey}`,
    summary: `Canonical summary for ${titleKey}.`,
    beijingTime: "2026-09-02 01:00",
    timeNote: "Published inside the fixed window.",
    fact_status: "media_report",
    time_status: "verified",
    platforms: [],
    region: "Global",
    releaseType: "news",
    sources: [{ label: "Example Source", url: `https://example.com/${titleKey}`, kind: "secondary" }],
    verification: "Opened source supports this event.",
    entry_flags: [],
    tracking: false,
    sharedFactFrameDigest: `sha256:${"1".repeat(64)}`,
    image_status: "unavailable",
    imageNote: "fixture",
  };
}

function englishEntry(eventKey, label) {
  return {
    eventKey,
    headline: `${label} English headline`,
    summary: `${label} English summary contains enough text for locale validation.`,
    verification: `${label} evidence was opened and verified for this fixture.`,
    timeNote: `${label} was published inside the fixed Beijing-time edition window.`,
    regionLabel: "Global",
    releaseTypeLabel: "News",
    sourceLabels: [{ sourceIndex: 0, label: "Example Source" }],
  };
}

describe("same-edition revision English ordering", () => {
  it("orders event-key drafts by final stable Canonical entry IDs", () => {
    const canonical = {
      schemaVersion: 2,
      id: "2026-09-02-daily",
      issueNumber: 23,
      date: "2026-09-02",
      period: "daily",
      plannedAt: "2026-09-02 12:00",
      generatedAt: "2026-09-02 15:39",
      windowStart: "2026-09-01 10:10",
      windowEnd: "2026-09-02 10:10",
      timezone: "Asia/Shanghai",
      nextEditionAt: "2026-09-03 12:00",
      revised: true,
      archiveTitle: "日报｜测试同版修订",
      leadEntryId: "2026-09-02-daily-news-0",
      entries: [
        canonicalEntry("2026-09-02-daily-news-0", "preserved-a"),
        canonicalEntry("2026-09-02-daily-news-2", "preserved-b"),
        canonicalEntry("2026-09-02-daily-news-3", "new-c"),
      ],
      upcoming: [],
      tracking: [],
      sourceReport: { checked: ["fixture"], limited: [], note: "fixture" },
    };
    const editorial = {
      locales: {
        en: {
          schemaVersion: 1,
          locale: "en",
          archiveTitle: "Daily Brief | Stable Canonical Revision Order",
          entries: [
            englishEntry("event-b", "Preserved B"),
            englishEntry("event-c", "New C"),
            englishEntry("event-a", "Preserved A"),
          ],
          upcoming: [],
          sourceReport: null,
        },
      },
    };
    const entryIdsByEvent = {
      "event-a": "2026-09-02-daily-news-0",
      "event-b": "2026-09-02-daily-news-2",
      "event-c": "2026-09-02-daily-news-3",
    };

    const result = buildEnglishOverlay({ canonical, editorial, entryIdsByEvent });

    expect(result.status).toBe("available");
    expect(result.overlay.entries.map((item) => item.entryId)).toEqual(
      canonical.entries.map((item) => item.id),
    );
    expect(result.overlay.entries.map((item) => item.headline)).toEqual([
      "Preserved A English headline",
      "Preserved B English headline",
      "New C English headline",
    ]);
  });
});
