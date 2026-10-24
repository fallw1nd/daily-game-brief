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
    upcoming: [{ upcomingId: edition.upcoming[0].id, coverAlt: "English cover description" }],
  };
}

describe("English presentation projection", () => {
  it("uses existing English copy when optional news and calendar alts are omitted", () => {
    const edition = canonical();
    const english = overlay(edition);
    delete english.entries[0].mediaAlts;
    delete english.upcoming[0].coverAlt;

    const projected = projectEnglishEdition(edition, english);
    expect(projected?.entries[0].images?.[0]).toEqual({
      ...edition.entries[0].images![0],
      alt: "Image for: Test Game Announces an Update",
    });
    expect(projected?.upcoming[0].cover).toEqual({
      ...edition.upcoming[0].cover,
      alt: "Next Game cover art",
    });
    expect(edition.entries[0].images?.[0].alt).toBe("中文图片说明");
    expect(edition.upcoming[0].cover?.alt).toBe("中文封面说明");
  });

  it("does not reuse translated alt from a different news asset", () => {
    const edition = canonical();
    const english = overlay(edition);
    english.entries[0].mediaAlts![0].assetKey = "different-asset";

    const projected = projectEnglishEdition(edition, english);
    expect(projected?.entries[0].images?.[0].alt).toBe("Image for: Test Game Announces an Update");
  });

  it.each([undefined, "", "   "])("uses generic cover copy when an English game name is unavailable (%j)", (titleEn) => {
    const edition = canonical();
    const english = overlay(edition);
    if (titleEn === undefined) Reflect.deleteProperty(edition.upcoming[0].title, "title_en");
    else edition.upcoming[0].title.title_en = titleEn;
    delete english.upcoming[0].coverAlt;

    expect(projectEnglishEdition(edition, english)?.upcoming[0].cover?.alt).toBe("Game cover art");
    expect(edition.upcoming[0].title.title_en).toBe(titleEn);
    expect(edition.upcoming[0].cover?.alt).toBe("中文封面说明");

    english.upcoming[0].coverAlt = "English cover description";
    expect(projectEnglishEdition(edition, english)?.upcoming[0].cover?.alt).toBe("English cover description");
  });

  it.each(["", "   "])("falls back when optional media alts are blank (%j)", (alt) => {
    const edition = canonical();
    const english = overlay(edition);
    english.entries[0].mediaAlts![0].alt = alt;
    english.upcoming[0].coverAlt = alt;

    const projected = projectEnglishEdition(edition, english);
    expect(projected?.entries[0].images?.[0].alt).toBe("Image for: Test Game Announces an Update");
    expect(projected?.upcoming[0].cover?.alt).toBe("Next Game cover art");
  });

  it("does not create images when Canonical has no media", () => {
    const edition = canonical();
    const english = overlay(edition);
    delete edition.entries[0].images;
    delete edition.upcoming[0].cover;

    const projected = projectEnglishEdition(edition, english);
    expect(projected?.entries[0].images).toBeUndefined();
    expect(projected?.upcoming[0].cover).toBeUndefined();
  });

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
    expect(projected?.upcoming[0].cover?.alt).toBe("English cover description");
  });
});


describe("English media availability and credits", () => {
  it.each([undefined, "", "   ", "未能取得已核验配图：来源页面不可读。"])("projects unavailable notes without changing canonical media (%j)", (note) => {
    const edition = canonical();
    const english = overlay(edition);
    delete edition.entries[0].images;
    delete edition.upcoming[0].cover;
    edition.entries[0].image_status = "unavailable";
    edition.upcoming[0].cover_status = "unavailable";
    edition.entries[0].imageNote = note;
    edition.upcoming[0].coverNote = note;
    const before = JSON.stringify(edition);
    const projected = projectEnglishEdition(edition, english)!;
    expect(projected.entries[0].imageNote).toBe(note?.trim()
      ? "Image availability details are recorded in the Chinese edition." : "Verified image unavailable.");
    expect(projected.upcoming[0].coverNote).toBe(note?.trim()
      ? "Cover availability details are recorded in the Chinese edition." : "Verified cover unavailable.");
    expect(projected.entries[0].images).toBeUndefined();
    expect(projected.upcoming[0].cover).toBeUndefined();
    expect(projected.entries[0].image_status).toBe("unavailable");
    expect(projected.upcoming[0].cover_status).toBe("unavailable");
    expect(JSON.stringify(edition)).toBe(before);
  });

  it("preserves explicit English notes and does not label verified media unavailable", () => {
    const edition = canonical();
    const english = overlay(edition);
    expect(projectEnglishEdition(edition, english)?.entries[0].imageNote).toBeUndefined();
    expect(projectEnglishEdition(edition, english)?.upcoming[0].coverNote).toBeUndefined();
    edition.entries[0].imageNote = "Source identity does not match.";
    edition.upcoming[0].coverNote = "Cover download failed.";
    const projected = projectEnglishEdition(edition, english)!;
    expect(projected.entries[0].imageNote).toBe(edition.entries[0].imageNote);
    expect(projected.upcoming[0].coverNote).toBe(edition.upcoming[0].coverNote);
    expect(projected.entries[0].images?.[0].sourceUrl).toBe(edition.entries[0].images?.[0].sourceUrl);
  });

  it("uses only the matching asset's explicit translated credit", () => {
    const edition = canonical();
    const english = overlay(edition);
    english.entries[0].mediaAlts![0].creditLabel = "English publisher";
    expect(projectEnglishEdition(edition, english)?.entries[0].images?.[0].credit).toBe("English publisher");
    expect(edition.entries[0].images?.[0].credit).toBe("Publisher");
    english.entries[0].mediaAlts![0].assetKey = "other-asset";
    expect(projectEnglishEdition(edition, english)?.entries[0].images?.[0].credit).toBe("Publisher");
  });

  it.each([undefined, "", "   "])("retains original credit for an absent or blank translation (%j)", (creditLabel) => {
    const edition = canonical();
    const english = overlay(edition);
    english.entries[0].mediaAlts![0].creditLabel = creditLabel;
    expect(projectEnglishEdition(edition, english)?.entries[0].images?.[0].credit).toBe("Publisher");
  });
});


it.each(["", "   "])("does not mark verified or placeholder media unavailable for blank notes (%j)", (note) => {
  const edition = canonical();
  const english = overlay(edition);
  edition.entries[0].imageNote = note;
  edition.upcoming[0].coverNote = note;
  edition.entries[0].images![0].placeholder = true;
  const before = JSON.stringify(edition);
  const projected = projectEnglishEdition(edition, english)!;
  expect(projected.entries[0].imageNote).toBe(note);
  expect(projected.upcoming[0].coverNote).toBe(note);
  expect(projected.entries[0].images![0].placeholder).toBe(true);
  expect(projected.entries[0].image_status).toBe("verified");
  expect(projected.upcoming[0].cover_status).toBe("verified");
  expect(JSON.stringify(edition)).toBe(before);
});
