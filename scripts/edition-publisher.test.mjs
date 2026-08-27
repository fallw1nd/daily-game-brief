import { describe, expect, it } from "vitest";
import { buildEdition } from "./lib/edition-publisher.mjs";

const packet = {
  editorialInput: {
    window: {
      id: "2026-08-27-am",
      period: "am",
      plannedAt: "2026-08-27 10:10",
      windowStart: "2026-08-26 17:00",
      windowEnd: "2026-08-27 10:10",
    },
    packages: [{
      eventKey: "event-1",
      tier: "A",
      sources: [{ sourceIndex: 0, status: "opened", kind: "primary", label: "Publisher", url: "https://publisher.example/news" }],
    }],
  },
};

const editorial = {
  editionId: "2026-08-27-am",
  archiveTitle: "早报｜《Example Game》正式公布",
  leadEventKey: "event-1",
  decisions: [{
    eventKey: "event-1",
    decision: "include",
    section: "news",
    titleKey: "example-game",
    titleZhCn: null,
    titleEn: "Example Game",
    titleZhStatus: "unavailable",
    headline: "《Example Game》正式公布",
    summary: "开发商公布了作品的首批确定信息。",
    factStatus: "official",
    timeStatus: "verified",
    entryFlags: [],
    tracking: false,
    verification: "已打开开发商公告。",
    reason: "一手来源确认。",
    beijingTime: "2026-08-27 09:30",
    timeNote: "公告时间处于固定窗口。",
    platforms: ["PC"],
    region: "全球",
    releaseType: "新作公布",
    sourceIndexes: [0],
    additionalSources: [],
  }],
  upcomingMode: "inherit_and_patch",
  removeUpcomingIds: [],
  upcoming: [],
  checkedExtra: [],
  limitedExtra: [],
  editorialNote: "使用程序证据包完成编辑。",
};

const latest = {
  upcoming: [{
    id: "upcoming-one",
    date: "08.28",
    title: { title_key: "upcoming-one", title_en: "Upcoming One", title_zh_status: "unavailable" },
    platforms: ["PC"], region: "全球", releaseType: "正式发售",
    source: { label: "Store", url: "https://store.example/one", kind: "primary" },
    note: "",
    cover_status: "unavailable",
    coverNote: "No verified cover.",
  }],
};
const manifest = { schemaVersion: 1, updatedAt: "2026-08-26 17:04", latest: "2026-08-26-pm", editions: [{ id: "2026-08-26-pm", issueNumber: 12 }] };

describe("idempotent edition publisher", () => {
  it("builds the next edition and preserves valid upcoming entries", () => {
    const result = buildEdition({ packet, editorial, latest, manifest, now: new Date("2026-08-27T02:12:00Z") });
    expect(result.status).toBe("built");
    expect(result.edition.issueNumber).toBe(13);
    expect(result.edition.leadEntryId).toBe("2026-08-27-am-news-0");
    expect(result.edition.entries[0].image_status).toBe("unavailable");
    expect(result.edition.upcoming.map((item) => item.id)).toEqual(["upcoming-one"]);
    expect(result.manifest.latest).toBe("2026-08-27-am");
    expect(result.edition.sourceReport.editorialDecisionDigest).toBe(result.decisionDigest);
    expect(result.decisionDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses the registered Chinese title when editorial output is unavailable", () => {
    const fableEditorial = {
      ...editorial,
      decisions: [{
        ...editorial.decisions[0],
        titleKey: "fable",
        titleEn: "Fable",
        titleZhCn: null,
        titleZhStatus: "unavailable",
        headline: "《Fable》正式公布",
      }],
      archiveTitle: "早报｜《Fable》正式公布",
    };
    const result = buildEdition({ packet, editorial: fableEditorial, latest, manifest, now: new Date("2026-08-27T02:12:00Z") });
    expect(result.edition.entries[0].title).toEqual({
      title_key: "fable",
      title_zh_cn: "神鬼寓言",
      title_en: "Fable",
      title_zh_status: "official_simplified",
    });
    expect(result.edition.entries[0].headline).toBe("《神鬼寓言》正式公布");
    expect(result.edition.archiveTitle).toBe("早报｜《神鬼寓言》正式公布");
  });

  it("returns without mutation when the edition already exists", () => {
    const result = buildEdition({
      packet, editorial, latest,
      manifest: { ...manifest, editions: [...manifest.editions, { id: "2026-08-27-am", issueNumber: 13 }] },
    });
    expect(result.status).toBe("already-exists");
    expect(result.edition).toBeNull();
  });

  it("revises a degraded edition without allocating a new issue number", () => {
    const degradedLatest = {
      ...latest,
      id: "2026-08-27-am",
      entries: [{ headline: "[自动事实清单] Example Game announced" }],
      sourceReport: { note: "正常ChatGPT定时任务未在SLA前完成；等待后续编辑修订。" },
    };
    const result = buildEdition({
      packet, editorial, latest: degradedLatest,
      manifest: { ...manifest, latest: "2026-08-27-am", editions: [...manifest.editions, { id: "2026-08-27-am", issueNumber: 13 }] },
    });
    expect(result.status).toBe("revised");
    expect(result.edition.issueNumber).toBe(13);
    expect(result.edition.revised).toBe(true);
    expect(result.manifest.editions.filter((item) => item.id === "2026-08-27-am")).toHaveLength(1);
  });

  it("preserves a verified cover when the morning table is replaced", () => {
    const cover = {
      url: "media/briefs/2026/08/2026-08-26-pm/upcoming-one-cover.jpg",
      alt: "Upcoming One游戏封面", credit: "Store", sourceUrl: "https://store.example/one",
      kind: "cover", aspect: "square",
    };
    const replacing = {
      ...editorial,
      upcomingMode: "replace",
      upcoming: [{
        id: "upcoming-one", date: "08.28", titleKey: "upcoming-one", titleZhCn: null,
        titleEn: "Upcoming One", titleZhStatus: "unavailable", platforms: ["PC"], region: "全球",
        releaseType: "正式发售", source: { label: "Store", url: "https://store.example/one", kind: "primary" }, note: "",
      }],
    };
    const result = buildEdition({
      packet, editorial: replacing,
      latest: { upcoming: [{ ...latest.upcoming[0], cover }] }, manifest,
    });
    expect(result.edition.upcoming[0].cover).toEqual(cover);
    expect(result.edition.upcoming[0].cover_status).toBe("verified");
  });
});
