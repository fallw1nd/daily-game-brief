import { describe, expect, it } from "vitest";
import { buildEnglishOverlay } from "./lib/bilingual-publisher.mjs";

const currentInheritedUpcoming = [
  ["u-platform-date", "全球／平台日期不同", "正式发售", "Xbox Wire"],
  ["u-focus", "全球／商店时区不同", "正式发售", "Focus Entertainment官方公告"],
  ["u-microids", "全球／商店时区不同", "正式发售", "Microids官方公告"],
  ["u-game-site", "全球", "正式发售", "游戏官网"],
  ["u-koei", "全球／地区商店不同", "平台移植版", "KOEI TECMO官方公告"],
  ["u-steam-news", "全球／商店时区不同", "正式发售", "Steam官方新闻"],
  ["u-nintendo", "北美", "平台移植版", "Nintendo官方商店"],
  ["u-steam-region", "全球／Steam部分地区显示9月3日", "正式发售", "Steam商店"],
  ["u-nitro", "全球／商店时区不同", "重制版正式发售", "Nitro Origin官方公告"],
  ["u-clear-river", "欧美", "地区发行／平台版", "Clear River Games公告转述（Gematsu）"],
  ["u-console-port", "全球", "主机移植版", "Gematsu（发行商公告转述）"],
  ["u-dlc", "全球", "DLC上线", "Paradox Interactive官方页面"],
  ["u-version-one", "全球", "1.0正式版／新增平台", "Valheim官方网站"],
  ["u-numskull", "全球", "正式发售", "Gematsu（Numskull公告转述）"],
  ["u-gamepass", "全球", "正式发售／Game Pass首发", "Gematsu（发行商公告转述）"],
  ["u-digital", "北美", "数字版正式发售", "Nintendo官方商店"],
];

function canonicalEdition() {
  return {
    schemaVersion: 2,
    id: "2026-08-29-pm",
    issueNumber: 18,
    date: "2026-08-29",
    period: "pm",
    plannedAt: "2026-08-29 17:00",
    generatedAt: "2026-08-29 17:01",
    windowStart: "2026-08-29 10:10",
    windowEnd: "2026-08-29 17:00",
    timezone: "Asia/Shanghai",
    nextEditionAt: "2026-08-30 10:10",
    archiveTitle: "晚报｜测试继承日历",
    leadEntryId: null,
    entries: [],
    upcoming: currentInheritedUpcoming.map(([id, region, releaseType, sourceLabel]) => ({
      id,
      date: "09.03",
      title: { title_key: id, title_en: id, title_zh_status: "unavailable" },
      platforms: ["PC"],
      region,
      releaseType,
      source: { label: sourceLabel, url: `https://example.com/${id}`, kind: "primary" },
      note: "fixture",
    })),
    tracking: [],
  };
}

function editorial() {
  return {
    contractVersion: 2,
    editionId: "2026-08-29-pm",
    archiveTitle: "晚报｜测试继承日历",
    leadEventKey: "",
    decisions: [],
    upcoming: [],
    locales: {
      en: {
        schemaVersion: 1,
        locale: "en",
        archiveTitle: "Evening Brief | Inherited Upcoming Bootstrap",
        entries: [],
        upcoming: [],
        sourceReport: null,
      },
    },
  };
}

describe("English upcoming bootstrap", () => {
  it("keeps an inherited PM calendar available before a previous English overlay exists", () => {
    const result = buildEnglishOverlay({ canonical: canonicalEdition(), editorial: editorial() });
    expect(result.status).toBe("available");
    expect(result.errors).toEqual([]);
    expect(result.overlay.upcoming).toHaveLength(currentInheritedUpcoming.length);
  });
});
