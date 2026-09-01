import { describe, expect, it } from "vitest";
import { buildEdition } from "./lib/edition-publisher.mjs";

const editionId = "2026-08-31-daily";
const manifest = {
  schemaVersion: 1,
  updatedAt: "2026-08-31 12:00",
  latest: editionId,
  editions: [{ id: editionId, issueNumber: 21, date: "2026-08-31", period: "daily" }],
};

const packet = {
  editorialInput: {
    window: {
      id: editionId,
      period: "daily",
      plannedAt: "2026-08-31 12:00",
      windowStart: "2026-08-30 17:00",
      windowEnd: "2026-08-31 10:10",
    },
    packages: [
      {
        eventKey: "halloween-revision",
        tier: "A",
        sources: [{ sourceIndex: 0, status: "opened", kind: "secondary", label: "Media A", url: "https://media.example/halloween" }],
      },
      {
        eventKey: "new-story",
        tier: "B",
        sources: [{ sourceIndex: 0, status: "opened", kind: "secondary", label: "Media B", url: "https://media.example/new-story" }],
      },
    ],
  },
};

function decision(eventKey, titleKey, titleEn, headline) {
  return {
    eventKey,
    decision: "include",
    section: "news",
    titleKey,
    titleZhCn: null,
    titleEn,
    titleZhStatus: "unavailable",
    headline,
    summary: `${titleEn} summary`,
    factStatus: "media_report",
    timeStatus: "date_only",
    entryFlags: [],
    tracking: false,
    verification: "Opened media report.",
    reason: "Within the fixed edition window.",
    beijingTime: null,
    timeNote: "Date is supported; no exact time claimed.",
    platforms: ["PC"],
    region: "全球",
    releaseType: "新闻",
    sourceIndexes: [0],
    additionalSources: [],
    sharedFactFrame: {
      subjectTitleKey: titleKey,
      dates: ["2026-08-31"],
      times: [],
      numbers: [],
      platforms: ["PC"],
      peopleAndEntities: [],
      versionsAndTerms: [],
    },
  };
}

const currentLatest = {
  id: editionId,
  issueNumber: 21,
  entries: [
    {
      id: `${editionId}-news-0`,
      section: "news",
      title: { title_key: "halloween-the-game", title_en: "Halloween: The Game", title_zh_status: "unavailable" },
      headline: "Old Halloween headline",
      images: [{ url: "media/briefs/halloween.jpg", alt: "Halloween", credit: "Official", sourceUrl: "https://official.example/halloween", kind: "editorial" }],
      image_status: "verified",
      mediaSources: [{ label: "Official", url: "https://official.example/halloween", kind: "primary" }],
    },
    {
      id: `${editionId}-news-1`,
      section: "news",
      title: { title_key: "crescent-tower-rising", title_en: "Crescent Tower: RISING", title_zh_status: "unavailable" },
      headline: "Existing Crescent Tower story",
      images: [{ url: "media/briefs/crescent.jpg", alt: "Crescent", credit: "Official", sourceUrl: "https://official.example/crescent", kind: "editorial" }],
      image_status: "verified",
    },
  ],
  upcoming: [{
    id: "upcoming-existing",
    date: "09.09",
    title: { title_key: "upcoming-existing", title_en: "Existing Upcoming", title_zh_status: "unavailable" },
    platforms: ["PC"],
    region: "全球",
    releaseType: "正式发售",
    source: { label: "Store", url: "https://store.example/game", kind: "primary" },
    note: "Existing verified calendar entry.",
    cover_status: "unavailable",
  }],
  tracking: [{ eventKey: "existing-tracking" }],
  sourceReport: { note: "Normal editorial publication." },
};

const editorial = {
  contractVersion: 2,
  editionId,
  archiveTitle: "日报｜《Halloween: The Game》日本PS5版取消发售",
  leadEventKey: "halloween-revision",
  decisions: [
    decision("halloween-revision", "halloween-the-game", "Halloween: The Game", "Updated Halloween headline"),
    decision("new-story", "new-story", "New Story", "A genuinely new story"),
  ],
  upcomingMode: "replace",
  removeUpcomingIds: [],
  upcoming: [],
  checkedExtra: [],
  limitedExtra: [],
  editorialNote: "Authorized same-edition revision overlay.",
};

function degradedYoungSunsEntry() {
  return {
    id: `${editionId}-releases-0`,
    section: "releases",
    title: {
      title_key: "rebuilding-better-together-for-the-1-0",
      title_en: "rebuilding better together for the 1 0",
      title_zh_status: "unavailable",
    },
    headline: "[自动事实清单] Rebuilding Better Together for the 1.0 Launch of Young Suns",
    summary: "Raw fallback excerpt.",
    sources: [{ label: "Xbox Wire", url: "https://news.xbox.com/en-us/example/young-suns", kind: "primary" }],
    images: [{
      url: "media/briefs/young-suns.jpg",
      alt: "Young Suns",
      credit: "Xbox Wire",
      sourceUrl: "https://news.xbox.com/en-us/example/young-suns",
      kind: "editorial",
    }],
    image_status: "verified",
  };
}

describe("authorized same-edition revision overlay", () => {
  it("replaces matching titles in place, preserves omitted canonical stories/media, and appends new entries", () => {
    const result = buildEdition({
      packet,
      editorial,
      latest: currentLatest,
      manifest,
      allowSameEditionRevision: true,
      now: new Date("2026-08-31T15:20:00Z"),
    });

    expect(result.status).toBe("revised");
    expect(result.edition.entries).toHaveLength(3);
    expect(result.edition.entries[0].id).toBe(`${editionId}-news-0`);
    expect(result.edition.entries[0].headline).toBe("Updated Halloween headline");
    expect(result.edition.entries[0].image_status).toBe("verified");
    expect(result.edition.entries[0].images[0].url).toBe("media/briefs/halloween.jpg");
    expect(result.edition.entries[1].headline).toBe("Existing Crescent Tower story");
    expect(result.edition.entries[1].image_status).toBe("verified");
    expect(result.edition.entries[2].id).toBe(`${editionId}-news-2`);
    expect(result.edition.entries[2].headline).toBe("A genuinely new story");
    expect(result.entryIdsByEvent["halloween-revision"]).toBe(`${editionId}-news-0`);
    expect(result.entryIdsByEvent["new-story"]).toBe(`${editionId}-news-2`);
  });

  it("drops an unmatched degraded placeholder while preserving omitted normal canonical stories", () => {
    const latest = structuredClone(currentLatest);
    latest.entries.unshift(degradedYoungSunsEntry());
    latest.sourceReport.note = "正常ChatGPT定时任务未在SLA前完成；已发布自动事实清单。";

    const result = buildEdition({
      packet,
      editorial,
      latest,
      manifest,
      allowSameEditionRevision: true,
    });

    expect(result.edition.entries.some((entry) => entry.headline.startsWith("[自动事实清单]"))).toBe(false);
    expect(result.edition.entries.some((entry) => entry.title?.title_key === "crescent-tower-rising")).toBe(true);
    expect(result.edition.entries.map((entry) => entry.id)).not.toContain(`${editionId}-releases-0`);
  });

  it("matches a degraded placeholder by unique source URL when its fallback title key was wrong", () => {
    const latest = structuredClone(currentLatest);
    latest.entries.unshift(degradedYoungSunsEntry());
    latest.sourceReport.note = "正常ChatGPT定时任务未在SLA前完成；已发布自动事实清单。";

    const revisedPacket = structuredClone(packet);
    revisedPacket.editorialInput.packages.push({
      eventKey: "young-suns-revision",
      tier: "A",
      sources: [{
        sourceIndex: 0,
        status: "opened",
        kind: "primary",
        label: "Xbox Wire",
        url: "https://news.xbox.com/en-us/example/young-suns",
      }],
    });
    const revisedEditorial = structuredClone(editorial);
    const youngSuns = decision("young-suns-revision", "young-suns", "Young Suns", "《Young Suns》1.0版本正式上线");
    youngSuns.section = "releases";
    youngSuns.factStatus = "official";
    youngSuns.releaseType = "正式上线";
    youngSuns.sharedFactFrame.subjectTitleKey = "young-suns";
    revisedEditorial.decisions.push(youngSuns);

    const result = buildEdition({
      packet: revisedPacket,
      editorial: revisedEditorial,
      latest,
      manifest,
      allowSameEditionRevision: true,
    });

    const entry = result.edition.entries.find((item) => item.title?.title_key === "young-suns");
    expect(entry?.id).toBe(`${editionId}-releases-0`);
    expect(entry?.headline).toBe("《Young Suns》1.0版本正式上线");
    expect(entry?.image_status).toBe("verified");
    expect(entry?.images?.[0]?.url).toBe("media/briefs/young-suns.jpg");
    expect(result.edition.entries.some((item) => item.headline.startsWith("[自动事实清单]"))).toBe(false);
  });

  it("preserves the current release calendar and tracking lane during an authorized revision", () => {
    const result = buildEdition({
      packet,
      editorial,
      latest: currentLatest,
      manifest,
      allowSameEditionRevision: true,
    });
    expect(result.edition.upcoming.map((item) => item.id)).toEqual(["upcoming-existing"]);
    expect(result.edition.tracking).toEqual([{ eventKey: "existing-tracking" }]);
  });

  it("keeps replace semantics for a normal new edition", () => {
    const newPacket = structuredClone(packet);
    newPacket.editorialInput.window = {
      id: "2026-09-01-daily",
      period: "daily",
      plannedAt: "2026-09-01 12:00",
      windowStart: "2026-08-31 10:10",
      windowEnd: "2026-09-01 10:10",
    };
    const newEditorial = structuredClone(editorial);
    newEditorial.editionId = "2026-09-01-daily";
    const result = buildEdition({ packet: newPacket, editorial: newEditorial, latest: currentLatest, manifest });
    expect(result.status).toBe("built");
    expect(result.edition.entries).toHaveLength(2);
    expect(result.edition.upcoming).toEqual([]);
  });
});
