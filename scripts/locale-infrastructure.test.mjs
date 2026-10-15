import { describe, expect, it } from "vitest";
import { canonicalCopyDigest, factsDigest, localeDigest } from "./lib/locale-digest.mjs";
import { validateEnglishOverlay } from "./lib/locale-overlay.mjs";
import { buildEnglishRepairOverlay } from "./lib/bilingual-publisher.mjs";
import { upcomingKey } from "../src/lib/locale-projection.js";

it("keeps a complete English edition available for the calendar labels used since October 10", () => {
  const canonical = canonicalEdition();
  const types = ["PC版发售", "平台版发售", "PS5版发售", "Nintendo Switch版发售", "Nintendo Switch 2版发售"];
  canonical.upcoming = types.map((releaseType, index) => ({
    id: `calendar-${index}`, date: "2026-09-01", title: canonical.entries[0].title,
    platforms: ["PC"], region: index % 2 ? "英国" : "未限定", releaseType,
    source: { label: "Steam", url: "https://store.steampowered.com/app/123", kind: "primary" },
  }));
  const result = buildEnglishRepairOverlay({ canonical, draft: {
    schemaVersion: 1, locale: "en", editionId: canonical.id,
    archiveTitle: "Morning Brief | Test Game announces an update",
    entries: [{ entryId: canonical.entries[0].id, headline: "Test Game announces an update",
      summary: "The official source announced an update for Test Game.",
      verification: "The primary source was opened.", timeNote: "Within the fixed window." }],
    upcoming: canonical.upcoming.map(item => ({ upcomingId: upcomingKey(canonical.id, item) })),
  } });
  expect(result.errors).toEqual([]);
  expect(result.status).toBe("available");
});

function canonicalEdition() {
  return {
    schemaVersion: 2,
    id: "2026-08-29-am",
    issueNumber: 17,
    date: "2026-08-29",
    period: "am",
    plannedAt: "2026-08-29 10:10",
    generatedAt: "2026-08-29 10:20",
    windowStart: "2026-08-28 17:00",
    windowEnd: "2026-08-29 10:10",
    timezone: "Asia/Shanghai",
    nextEditionAt: "2026-08-29 17:00",
    revised: false,
    archiveTitle: "早报｜测试事实",
    leadEntryId: "2026-08-29-am-news-0",
    entries: [{
      id: "2026-08-29-am-news-0",
      section: "news",
      title: { title_key: "test-game", title_en: "Test Game", title_zh_cn: "测试游戏", title_zh_status: "official_simplified" },
      headline: "测试游戏公布更新",
      summary: "这是用于测试双语事实边界的中文摘要。",
      beijingTime: "2026-08-29 09:00",
      timeNote: "来源时间位于固定窗口内。",
      fact_status: "official",
      time_status: "verified",
      entry_flags: [],
      platforms: ["PC"],
      region: "Global",
      releaseType: "Version update",
      sources: [{ label: "Official site", url: "https://example.com/news", kind: "primary" }],
      verification: "已打开一手来源。",
      tracking: false,
      imageSeed: "test-game",
      image_status: "verified",
      images: [{ url: "media/test.jpg", alt: "中文图片说明", credit: "Publisher", sourceUrl: "https://example.com/news", kind: "editorial", aspect: "landscape" }],
    }],
    upcoming: [],
    tracking: [],
    sourceReport: { checked: ["已核验来源"], limited: [], note: "测试。" },
  };
}

function validOverlay(canonical) {
  const overlay = {
    schemaVersion: 1,
    locale: "en",
    editionId: canonical.id,
    baseSchemaVersion: canonical.schemaVersion,
    factsDigest: factsDigest(canonical),
    canonicalCopyDigest: canonicalCopyDigest(canonical),
    localeDigest: `sha256:${"0".repeat(64)}`,
    archiveTitle: "Morning Brief | Test Game Update",
    entries: [{
      entryId: canonical.entries[0].id,
      headline: "Test Game Announces an Update",
      summary: "The official source confirms the update within the same verified fact boundary.",
      verification: "The primary source was opened and supports the stated event and timing.",
      timeNote: "The source time falls within the fixed Beijing-time edition window.",
      mediaAlts: [],
    }],
    upcoming: [],
  };
  overlay.localeDigest = localeDigest(overlay);
  return overlay;
}

describe("English locale infrastructure", () => {
  it("accepts a complete overlay bound to the canonical facts", () => {
    const canonical = canonicalEdition();
    const result = validateEnglishOverlay(canonical, validOverlay(canonical));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("does not invent a release type when Canonical has none", () => {
    const canonical = canonicalEdition();
    delete canonical.entries[0].releaseType;
    const overlay = validOverlay(canonical);
    overlay.factsDigest = factsDigest(canonical);
    overlay.canonicalCopyDigest = canonicalCopyDigest(canonical);
    overlay.localeDigest = localeDigest(overlay);
    const result = validateEnglishOverlay(canonical, overlay);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(overlay.entries[0].releaseTypeLabel).toBeUndefined();
  });

  it("rejects stale facts while treating Chinese copy-only edits as a warning", () => {
    const canonical = canonicalEdition();
    const overlay = validOverlay(canonical);
    const factualChange = structuredClone(canonical);
    factualChange.entries[0].platforms = ["PC", "PS5"];
    expect(validateEnglishOverlay(factualChange, overlay).errors).toContain("overlay.factsDigest is stale for canonical facts");

    const copyChange = structuredClone(canonical);
    copyChange.entries[0].summary = "只修改中文措辞，不改变事实字段。";
    const copyResult = validateEnglishOverlay(copyChange, overlay);
    expect(copyResult.valid).toBe(true);
    expect(copyResult.warnings.some((warning) => warning.includes("canonicalCopyDigest"))).toBe(true);
  });

  it("does not stale facts after media-only enrichment", () => {
    const canonical = canonicalEdition();
    const enriched = structuredClone(canonical);
    enriched.entries[0].images.push({ url: "media/second.jpg", alt: "第二张图", credit: "Publisher", sourceUrl: "https://example.com/news", kind: "editorial" });
    expect(factsDigest(enriched)).toBe(factsDigest(canonical));
  });

  it("rejects forbidden factual fields and non-reproducible locale digests", () => {
    const canonical = canonicalEdition();
    const overlay = validOverlay(canonical);
    overlay.entries[0].platforms = ["PS5"];
    overlay.localeDigest = `sha256:${"1".repeat(64)}`;
    const result = validateEnglishOverlay(canonical, overlay);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("forbidden factual field platforms"))).toBe(true);
    expect(result.errors).toContain("overlay.localeDigest cannot be reproduced");
  });
});
