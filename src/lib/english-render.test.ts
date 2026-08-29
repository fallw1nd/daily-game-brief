import { describe, expect, it } from "vitest";
import type { BriefEdition, EnglishLocaleOverlay } from "../types";
import { assetKey } from "./locale-projection.js";
import { projectEnglishEdition } from "./english-render";

function canonical(): BriefEdition {
  return {
    schemaVersion: 2,
    id: "2026-08-29-pm",
    issueNumber: 18,
    date: "2026-08-29",
    period: "pm",
    plannedAt: "2026-08-29 17:00",
    generatedAt: "2026-08-29 19:33",
    windowStart: "2026-08-29 10:10",
    windowEnd: "2026-08-29 17:00",
    timezone: "Asia/Shanghai",
    nextEditionAt: "2026-08-30 10:10",
    revised: false,
    archiveTitle: "晚报｜测试",
    leadEntryId: "2026-08-29-pm-news-0",
    entries: [{
      id: "2026-08-29-pm-news-0",
      section: "news",
      title: { title_key: "test-game", title_en: "Test Game", title_zh_cn: "测试游戏", title_zh_status: "official_simplified" },
      headline: "测试游戏公布更新",
      summary: "中文摘要。",
      beijingTime: "2026-08-29 16:00",
      timeNote: "中文时间说明。",
      fact_status: "official",
      time_status: "verified",
      entry_flags: [],
      platforms: ["PC"],
      region: "全球",
      releaseType: "正式发售",
      sources: [{ label: "Steam商店", url: "https://example.com/store", kind: "primary" }],
      verification: "中文核验说明。",
      imageSeed: "test-game",
      image_status: "verified",
      images: [{ url: "media/test.webp", alt: "中文图片说明", credit: "Publisher", sourceUrl: "https://example.com/image", kind: "editorial" }],
    }],
    upcoming: [{
      id: "upcoming-test",
      date: "09.01",
      title: { title_key: "next-game", title_en: "Next Game", title_zh_cn: "下一款游戏", title_zh_status: "common_translation" },
      platforms: ["PS5"],
      region: "全球",
      releaseType: "正式发售",
      source: { label: "Steam商店", url: "https://example.com/next", kind: "primary" },
      note: "fixture",
      cover: { url: "media/cover.webp", alt: "中文封面说明", credit: "Publisher", sourceUrl: "https://example.com/cover", kind: "cover" },
      cover_status: "verified",
    }],
    tracking: [],
  };
}

function overlay(edition: BriefEdition): EnglishLocaleOverlay {
  const image = edition.entries[0].images![0];
  return {
    schemaVersion: 1,
    locale: "en",
    editionId: edition.id,
    baseSchemaVersion: 2,
    factsDigest: `sha256:${"1".repeat(64)}`,
    canonicalCopyDigest: `sha256:${"2".repeat(64)}`,
    localeDigest: `sha256:${"3".repeat(64)}`,
    archiveTitle: "Evening Brief | Test Game Update",
    entries: [{
      entryId: edition.entries[0].id,
      headline: "Test Game Announces an Update",
      summary: "English summary.",
      verification: "English verification.",
      timeNote: "English time note.",
      mediaAlts: [{ assetKey: assetKey(edition.entries[0].id, image), alt: "English image description" }],
    }],
    upcoming: [{ upcomingId: edition.upcoming[0].id, coverAlt: "Next Game cover art" }],
  };
}

describe("English presentation projection", () => {
  it("changes presentation copy while retaining Canonical fact fields", () => {
    const edition = canonical();
    const projected = projectEnglishEdition(edition, overlay(edition));
    expect(projected).not.toBeNull();
    expect(projected?.id).toBe(edition.id);
    expect(projected?.issueNumber).toBe(edition.issueNumber);
    expect(projected?.entries[0].platforms).toEqual(["PC"]);
    expect(projected?.entries[0].fact_status).toBe("official");
    expect(projected?.entries[0].title.title_en).toBe("Test Game");
    expect(projected?.entries[0].title.title_zh_cn).toBeUndefined();
    expect(projected?.entries[0].headline).toBe("Test Game Announces an Update");
    expect(projected?.entries[0].region).toBe("Global");
    expect(projected?.entries[0].releaseType).toBe("Full release");
    expect(projected?.entries[0].sources[0].label).toBe("Steam store");
    expect(projected?.entries[0].images?.[0].alt).toBe("English image description");
    expect(projected?.upcoming[0].cover?.alt).toBe("Next Game cover art");
  });
});
