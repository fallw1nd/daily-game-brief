import { describe, expect, it } from "vitest";
import { buildEdition } from "./lib/edition-publisher.mjs";
import { applyRevisionSubjectIdentityOverrides } from "./lib/revision-packet.mjs";
import { buildDegradedDecision } from "./lib/degraded-decision.mjs";

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
  it("does not invent global coverage when editorial region is omitted", () => {
    const draft = structuredClone(editorial);
    draft.decisions[0].region = null;
    expect(buildEdition({ packet, editorial: draft, latest, manifest }).edition.entries[0].region).toBe("来源所述范围");
    draft.decisions[0].region = "日本";
    expect(buildEdition({ packet, editorial: draft, latest, manifest }).edition.entries[0].region).toBe("日本");
    draft.decisions[0].region = "全球";
    expect(buildEdition({ packet, editorial: draft, latest, manifest }).edition.entries[0].region).toBe("全球");
  });
  it("does not inherit a corrected same-ID row's old subject or cover", () => {
    const old = { ...latest.upcoming[0], title: { title_key: "old-game", title_en: "Old Game", title_zh_cn: "旧游戏", title_zh_status: "official_simplified" }, cover_status: "verified", cover: { kind: "cover", url: "old.jpg" } };
    const patch = { id: old.id, date: "2026-08-28", titleKey: "correct-game", titleEn: "Correct Game", titleZhCn: "正确游戏", titleZhStatus: "official_simplified", platforms: ["PC"], region: "全球", releaseType: "正式发售", source: { kind: "primary", label: "Steam", url: "https://store.steampowered.com/app/456/" } };
    const result = buildEdition({ packet, editorial: { ...editorial, upcoming: [patch] }, latest: { upcoming: [old] }, manifest });
    expect(result.edition.upcoming[0]).toMatchObject({ id: old.id, title: { title_key: "correct-game", title_en: "Correct Game", title_zh_cn: "正确游戏" }, cover_status: "unavailable", source: patch.source });
    expect(result.edition.upcoming[0].cover).toBeUndefined();
  });
  it("rejects exact duplicate decisions even under distinct event keys", () => {
    const duplicatePacket = structuredClone(packet);
    duplicatePacket.editorialInput.packages.push({ ...duplicatePacket.editorialInput.packages[0], eventKey: "event-2" });
    const duplicateDraft = structuredClone(editorial);
    duplicateDraft.decisions.push({ ...duplicateDraft.decisions[0], eventKey: "event-2" });
    expect(() => buildEdition({ packet: duplicatePacket, editorial: duplicateDraft, latest, manifest }))
      .toThrow("exact duplicate news stories");
    duplicateDraft.decisions[1].headline = "《Example Game》公布另一段预告";
    duplicateDraft.decisions[1].summary = "同一来源还报道了独立的另一项事实。";
    expect(buildEdition({ packet: duplicatePacket, editorial: duplicateDraft, latest, manifest }).edition.entries).toHaveLength(2);
  });

  it("reuses the stable legacy entry ID for an exact continuation replay without existingEntryId", () => {
    const initial = buildEdition({ packet, editorial, latest, manifest });
    const canonical = structuredClone(initial.edition);
    delete canonical.entries[0].eventKey;
    const scoped = structuredClone(packet);
    scoped.continuation = { scope: "news", preservePublished: true };
    scoped.editorialInput.packages[0].eventKey = "replayed-event";
    const draft = structuredClone(editorial);
    draft.decisions[0].eventKey = "replayed-event";
    draft.leadEventKey = "replayed-event";
    const result = buildEdition({ packet: scoped, editorial: draft, latest: canonical, manifest: initial.manifest, allowSameEditionRevision: true });
    expect(result.edition.entries).toEqual(canonical.entries);
    expect(result.entryIdsByEvent["replayed-event"]).toBe(canonical.entries[0].id);
    const historicalDuplicates = structuredClone(canonical);
    historicalDuplicates.entries.push({ ...historicalDuplicates.entries[0], id: `${canonical.id}-news-1` });
    expect(() => buildEdition({ packet: scoped, editorial: draft, latest: historicalDuplicates, manifest: initial.manifest, allowSameEditionRevision: true }))
      .toThrow("multiple published exact duplicates");
    const calendarPacket = { ...scoped, continuation: { scope: "calendar", preservePublished: true },
      editorialInput: { ...scoped.editorialInput, packages: [] } };
    const calendarDraft = { ...draft, decisions: [] };
    const repaired = buildEdition({ packet: calendarPacket, editorial: calendarDraft, latest: historicalDuplicates, manifest: initial.manifest, allowSameEditionRevision: true, repairExactDuplicateStories: true });
    expect(repaired.edition.entries).toEqual(canonical.entries);
    expect(repaired.duplicateStoryRepairs).toEqual([{ removedEntryId: `${canonical.id}-news-1`, retainedEntryId: canonical.entries[0].id }]);
    historicalDuplicates.leadEntryId = `${canonical.id}-news-1`;
    const leadRepair = buildEdition({ packet: calendarPacket, editorial: calendarDraft, latest: historicalDuplicates, manifest: initial.manifest, allowSameEditionRevision: true, repairExactDuplicateStories: true });
    expect(leadRepair.edition.entries[0].id).toBe(historicalDuplicates.leadEntryId);
    expect(leadRepair.edition.leadEntryId).toBe(historicalDuplicates.leadEntryId);
    historicalDuplicates.entries[1].verification = "Different factual verification must not be discarded.";
    expect(buildEdition({ packet: calendarPacket, editorial: calendarDraft, latest: historicalDuplicates, manifest: initial.manifest, allowSameEditionRevision: true, repairExactDuplicateStories: true }).duplicateStoryRepairs).toEqual([]);

    expect(buildEdition({ packet: calendarPacket, editorial: calendarDraft, latest: historicalDuplicates, manifest: initial.manifest, allowSameEditionRevision: true }).edition.entries)
      .toEqual(historicalDuplicates.entries);
    // Same game and source do not establish the same fact.
    draft.decisions[0].summary = "另一段预告展示了不同的玩法内容。";
    expect(buildEdition({ packet: scoped, editorial: draft, latest: canonical, manifest: initial.manifest, allowSameEditionRevision: true }).edition.entries).toHaveLength(2);
  });

  it("coalesces a calendar alias into the published ID rather than adding a second release", () => {
    const prior = { ...latest.upcoming[0], source: { kind: "primary", label: "Steam", url: "https://store.steampowered.com/app/123/" } };
    const patch = { id: "new-store-id", date: prior.date, titleKey: "new-key", titleEn: prior.title.title_en, titleZhStatus: "unavailable", platforms: prior.platforms, region: prior.region, releaseType: prior.releaseType, source: prior.source, note: "Updated verification." };
    const result = buildEdition({ packet, editorial: { ...editorial, upcoming: [patch] }, latest: { upcoming: [prior] }, manifest });
    expect(result.edition.upcoming).toHaveLength(1);
    expect(result.edition.upcoming[0]).toMatchObject({ id: prior.id, title: { title_key: prior.title.title_key } });
  });
  it("publishes degraded Daily news while retaining and naturally expiring the verified calendar baseline", () => {
    const dailyPacket = structuredClone(packet);
    dailyPacket.editorialInput.window = {
      id: "2026-09-20-daily", period: "daily", plannedAt: "2026-09-20 12:00",
      windowStart: "2026-09-19 10:10", windowEnd: "2026-09-20 10:10",
    };
    Object.assign(dailyPacket.editorialInput.packages[0], {
      tier: "A", timeRelation: "window", eventKind: "announcement", subjectKey: "Example Game",
      publishability: "direct", headline: "Example Game announced",
      sources: [{ sourceIndex: 0, status: "opened", kind: "primary", independenceKey: "publisher", label: "Publisher",
        url: "https://publisher.example/news", publishedAt: "2026-09-20T01:00:00Z", evidenceText: "Publisher announced Example Game." }],
    });
    dailyPacket.editorialInput.upcomingDiscovery = {
      window: { startInclusive: "2026-09-21", endInclusive: "2026-10-05" },
      candidates: [{ title: "Auto Adopt Game", date: "2026-09-29", url: "https://store.steampowered.com/app/1/",
        platforms: ["PC", "Xbox Series X|S"], sourceId: "steam", kind: "primary", knownTitle: true, crossSource: true }],
    };
    const current = {
      id: "2026-09-19-daily", issueNumber: 40, entries: [], upcoming: [
        { id: "verified-in-window", date: "09.22", title: { title_key: "verified-in-window", title_en: "Verified In Window", title_zh_status: "unavailable" },
          platforms: ["PC"], region: "全球", releaseType: "正式发售", source: { label: "Publisher", url: "https://publisher.example/release", kind: "primary" }, note: "" },
        { id: "verified-expired", date: "09.19", title: { title_key: "verified-expired", title_en: "Verified Expired", title_zh_status: "unavailable" },
          platforms: ["PC"], region: "全球", releaseType: "正式发售", source: { label: "Publisher", url: "https://publisher.example/old", kind: "primary" }, note: "" },
      ],
    };
    const dailyManifest = { schemaVersion: 1, updatedAt: "2026-09-19 12:00", latest: current.id, editions: [{ id: current.id, issueNumber: 40 }] };
    const degraded = buildDegradedDecision(dailyPacket);
    const result = buildEdition({
      packet: dailyPacket, editorial: degraded, latest: current, manifest: dailyManifest,
      now: new Date("2026-09-20T04:00:00Z"),
    });
    expect(degraded).toMatchObject({ upcomingMode: "inherit_and_patch", removeUpcomingIds: [], upcoming: [] });
    expect(result.edition.entries[0].headline).toContain("Example Game announced");
    expect(result.edition.upcoming.map(item => item.id)).toEqual(["verified-in-window"]);
  });

  it("rejects an archive title that exceeds the limit after adding its confirmed subject", () => {
    const draft = structuredClone(editorial);
    draft.archiveTitle = "早报｜" + "公告".repeat(15);
    expect([...draft.archiveTitle].length).toBeLessThanOrEqual(40);
    expect(() => buildEdition({ packet, editorial: draft, latest, manifest })).toThrow("normalized archiveTitle");
  });
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

  it("keeps full-date Daily calendar patches and writes canonical MM.DD dates", () => {
    const dailyPacket = {
      editorialInput: {
        ...packet.editorialInput,
        window: {
          id: "2026-09-17-daily",
          period: "daily",
          plannedAt: "2026-09-17 12:00",
          windowStart: "2026-09-16 10:10",
          windowEnd: "2026-09-17 10:10",
        },
      },
    };
    const dailyEditorial = {
      ...editorial,
      editionId: "2026-09-17-daily",
      archiveTitle: "日报｜《Example Game》正式公布",
      decisions: [{ ...editorial.decisions[0], beijingTime: "2026-09-17 09:30" }],
      upcomingMode: "inherit_and_patch",
      upcoming: [
        {
          id: "2026-09-29-transport-fever-3-pc",
          date: "2026-09-29",
          titleKey: "transport-fever-3",
          titleZhCn: "狂热运输3",
          titleEn: "Transport Fever 3",
          titleZhStatus: "common_translation",
          platforms: ["PC"],
          region: "全球",
          releaseType: "launch",
          source: { label: "Transport Fever 3 Official Site", url: "https://www.transportfever3.com/", kind: "primary" },
          note: "官方网站确认日期。",
        },
        {
          id: "outside-wrong-year",
          date: "2027-09-29",
          titleKey: "outside-wrong-year",
          titleZhCn: null,
          titleEn: "Outside Wrong Year",
          titleZhStatus: "unavailable",
          platforms: ["PC"],
          region: "全球",
          releaseType: "launch",
          source: { label: "Store", url: "https://store.example/outside", kind: "primary" },
          note: "应被窗口过滤。",
        },
      ],
    };
    const current = {
      id: "2026-09-17-daily",
      issueNumber: 38,
      entries: [],
      upcoming: [{
        id: "upcoming-existing",
        date: "09.24",
        title: { title_key: "existing", title_en: "Existing", title_zh_status: "unavailable" },
        platforms: ["PC"], region: "全球", releaseType: "正式发售",
        source: { label: "Store", url: "https://store.example/existing", kind: "primary" },
        note: "",
        cover_status: "unavailable",
      }],
    };
    const dailyManifest = {
      schemaVersion: 1,
      updatedAt: "2026-09-17 12:00",
      latest: "2026-09-17-daily",
      editions: [{ id: "2026-09-17-daily", issueNumber: 38 }],
    };
    const result = buildEdition({
      packet: dailyPacket,
      editorial: dailyEditorial,
      latest: current,
      manifest: dailyManifest,
      allowSameEditionRevision: true,
      now: new Date("2026-09-17T10:14:00Z"),
    });
    expect(result.status).toBe("revised");
    expect(result.edition.issueNumber).toBe(38);
    expect(result.edition.upcoming.map((item) => [item.id, item.date])).toEqual([
      ["upcoming-existing", "09.24"],
      ["2026-09-29-transport-fever-3-pc", "09.29"],
    ]);
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

  it("localizes the confirmed single-word subject and registered DLC without altering ordinary summary prose", () => {
    const fountainsEditorial = {
      ...editorial,
      archiveTitle: "早报｜《Fountains》推出 Shattered Shape DLC",
      decisions: [{
        ...editorial.decisions[0],
        titleKey: "fountains",
        titleEn: "Fountains",
        titleZhCn: "永泉传说",
        titleZhStatus: "official_simplified",
        headline: "《Fountains》推出 Shattered Shape DLC",
        summary: "Ordinary fountains nearby were also mentioned.",
      }],
    };
    const result = buildEdition({ packet, editorial: fountainsEditorial, latest, manifest, now: new Date("2026-08-27T02:12:00Z") });
    expect(result.edition.entries[0].headline).toBe("《永泉传说》推出 破碎之形 DLC");
    expect(result.edition.entries[0].summary).toBe("Ordinary 永泉传说 nearby were also mentioned.");
    expect(result.edition.archiveTitle).toBe("早报｜《永泉传说》推出 破碎之形 DLC");
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

  it("publishes Daily as schema v2 with a noon planned time and continuous issue number", () => {
    const dailyPacket = {
      editorialInput: {
        ...packet.editorialInput,
        window: {
          id: "2026-09-01-daily",
          period: "daily",
          plannedAt: "2026-09-01 12:00",
          windowStart: "2026-08-31 10:10",
          windowEnd: "2026-09-01 10:10",
        },
      },
    };
    const dailyEditorial = {
      ...editorial,
      editionId: "2026-09-01-daily",
      archiveTitle: "日报｜《Example Game》正式公布",
      upcomingMode: "replace",
      decisions: [{
        ...editorial.decisions[0],
        beijingTime: "2026-09-01 09:30",
      }],
    };
    const dailyManifest = {
      ...manifest,
      latest: "2026-08-31-am",
      editions: [
        { id: "2026-08-30-pm", issueNumber: 19 },
        { id: "2026-08-31-am", issueNumber: 20 },
      ],
    };
    const result = buildEdition({
      packet: dailyPacket,
      editorial: dailyEditorial,
      latest,
      manifest: dailyManifest,
      now: new Date("2026-09-01T02:12:00Z"),
    });
    expect(result.status).toBe("built");
    expect(result.edition).toMatchObject({
      id: "2026-09-01-daily",
      issueNumber: 21,
      period: "daily",
      schemaVersion: 2,
      archiveTitle: "日报｜《Example Game》正式公布",
      plannedAt: "2026-09-01 12:00",
      nextEditionAt: "2026-09-02 12:00",
      windowStart: "2026-08-31 10:10",
      windowEnd: "2026-09-01 10:10",
    });
    expect(result.manifest.latest).toBe("2026-09-01-daily");
    expect(result.archivePath).toBe("archive/2026/09/2026-09-01-daily.json");
    expect(result.edition.upcoming).toEqual([]);
  });
});


describe("manual factual metadata corrections", () => {
  function companyFixture() {
    const input = structuredClone(packet);
    input.editorialInput.packages[0].headline = '『Ever17』の作者が新会社「Crash Keys」設立';
    input.editorialInput.packages[0].sources[0].evidenceText = "株式会社Crash Keysの設立を正式に発表した。";
    Object.assign(input.editorialInput.packages[0], { subjectKey: "ever17", publishability: "direct" });
    const draft = structuredClone(editorial);
    Object.assign(draft.decisions[0], { titleKey: "ever17", titleEn: "Crash Keys", headline: "Crash Keys公司正式成立", summary: "Crash Keys将开展原创项目。",
      sharedFactFrame: { subjectTitleKey: "ever17", dates: [], times: [], numbers: [], platforms: ["PC"], peopleAndEntities: ["Crash Keys"], versionsAndTerms: [] } });
    draft.archiveTitle = "早报｜Crash Keys公司正式成立";
    const initial = buildEdition({ packet: input, editorial: draft, latest, manifest });
    input.continuation = { scope: "news", preservePublished: true };
    draft.decisions[0].existingEntryId = initial.edition.entries[0].id;
    return { input, draft, initial };
  }
  it("corrects only verification under explicit manual authorization and exact fact identity", () => {
    const { input, draft, initial } = companyFixture();
    draft.decisions[0].verification = "Corrected opened-source verification.";
    const options = { packet: input, editorial: draft, latest: initial.edition, manifest: initial.manifest, allowSameEditionRevision: true };
    expect(buildEdition(options).edition.entries[0].verification).toBe(initial.edition.entries[0].verification);
    const corrected = buildEdition({ ...options, repairExactDuplicateStories: true }).edition.entries[0];
    expect(corrected).toEqual({ ...initial.edition.entries[0], verification: draft.decisions[0].verification });
    draft.decisions[0].summary = "Changed event facts.";
    expect(() => buildEdition({ ...options, repairExactDuplicateStories: true })).toThrow("preserve the exact published fact");
  });
  it("reuses the bound company's stable ID across a key correction and rejects unsafe rebindings", () => {
    const { input, draft, initial } = companyFixture();
    const prior = initial.edition.entries[0];
    delete input.continuation;
    const other = { ...prior, id: `${initial.edition.id}-news-9`, title: { title_key: "other", title_en: "Other", title_zh_status: "unavailable" }, headline: "Other story", summary: "Different facts" };
    initial.edition.entries.push(other);
    initial.edition.leadEntryId = other.id;
    initial.edition.archiveTitle = "早报｜另外一条新闻作为本期头条";
    const repaired = applyRevisionSubjectIdentityOverrides(input, { editionId: initial.edition.id, reason: "user_authorized_same_edition_revision", packetBlobSha: "a".repeat(40),
      subjectIdentityOverrides: { "event-1": { key: "crash-keys", kind: "entity", expectedOldSubjectKey: "ever17", expectedEntryId: prior.id,
        expectedBeijingTime: prior.beijingTime, expectedSourceUrls: prior.sources.map(source => source.url) } } });
    draft.decisions[0].titleKey = "crash-keys";
    draft.decisions[0].sharedFactFrame.subjectTitleKey = "crash-keys";
    const options = { packet: repaired, editorial: draft, latest: initial.edition, manifest: initial.manifest, allowSameEditionRevision: true, repairExactDuplicateStories: true };
    const result = buildEdition(options);
    expect(result.edition.entries).toHaveLength(2);
    expect(result.edition.leadEntryId).toBe(other.id);
    expect(result.edition.archiveTitle).toBe(initial.edition.archiveTitle);
    expect(result.edition.entries[0]).toMatchObject({ id: prior.id, title: { title_key: "crash-keys", title_en: "Crash Keys" }, headline: prior.headline, summary: prior.summary, sources: prior.sources, beijingTime: prior.beijingTime });
    expect(result.edition.entries[0].sharedFactFrameDigest).not.toBe(prior.sharedFactFrameDigest);
    expect(() => buildEdition({ ...options, repairExactDuplicateStories: false })).toThrow("bound published event");
    for (const property of ["eventKey", "beijingTime"]) {
      const badLatest = structuredClone(initial.edition); badLatest.entries[0][property] = "wrong";
      expect(() => buildEdition({ ...options, latest: badLatest })).toThrow("bound published event");
    }
    draft.decisions[0].sharedFactFrame.numbers = ["invented fact"];
    expect(() => buildEdition(options)).toThrow("preserve the shared fact frame");
  });
});


describe("manual revision preserves separate stories about one game", () => {
  function multipleStories() {
    const input = structuredClone(packet);
    input.editorialInput.packages.push({ ...structuredClone(input.editorialInput.packages[0]), eventKey: "event-2" });
    input.editorialInput.packages.push({ ...structuredClone(input.editorialInput.packages[0]), eventKey: "event-3" });
    const draft = structuredClone(editorial);
    draft.decisions.push({ ...structuredClone(draft.decisions[0]), eventKey: "event-2", headline: "《Example Game》公布独立地图机制", summary: "这是一条不同的地图机制消息。" });
    draft.decisions.push({ ...structuredClone(draft.decisions[0]), eventKey: "event-3", titleKey: "another-game", titleEn: "Another Game", headline: "《Another Game》公布更新", summary: "另一款游戏的消息。" });
    const initial = buildEdition({ packet: input, editorial: draft, latest, manifest });
    const revision = { ...structuredClone(draft), decisions: [structuredClone(draft.decisions[0])] };
    revision.decisions[0].headline = "《Example Game》正式公布（修订译名）";
    return { input, initial, revision };
  }
  it.each([true, false])("selects the actual first event instead of the last same-title story (explicit ID: %j)", (explicit) => {
    const { input, initial, revision } = multipleStories();
    if (explicit) revision.decisions[0].existingEntryId = initial.edition.entries[0].id;
    const result = buildEdition({ packet: input, editorial: revision, latest: initial.edition, manifest: initial.manifest, allowSameEditionRevision: true });
    expect(result.edition.entries.map(x => x.id)).toEqual(initial.edition.entries.map(x => x.id));
    expect(result.edition.entries[0].headline).toBe(revision.decisions[0].headline);
    expect(result.edition.entries.slice(1)).toEqual(initial.edition.entries.slice(1));
    expect(result.edition.upcoming).toEqual(initial.edition.upcoming);
    expect(result.edition.issueNumber).toBe(initial.edition.issueNumber);
  });
  it.each([1, 2, 99])("rejects wrong-event, wrong-subject or absent explicit ID (%j)", (index) => {
    const { input, initial, revision } = multipleStories();
    revision.decisions[0].existingEntryId = initial.edition.entries[index]?.id || "missing-entry";
    expect(() => buildEdition({ packet: input, editorial: revision, latest: initial.edition, manifest: initial.manifest, allowSameEditionRevision: true }))
      .toThrow("existingEntryId must identify");
  });
  it("rejects ambiguous legacy subject fallback rather than choosing the last story", () => {
    const { input, initial, revision } = multipleStories();
    for (const entry of initial.edition.entries) delete entry.eventKey;
    expect(() => buildEdition({ packet: input, editorial: revision, latest: initial.edition, manifest: initial.manifest, allowSameEditionRevision: true }))
      .toThrow("ambiguous published subject");
    revision.decisions[0].existingEntryId = initial.edition.entries[0].id;
    const result = buildEdition({ packet: input, editorial: revision, latest: initial.edition, manifest: initial.manifest, allowSameEditionRevision: true });
    expect(result.edition.entries[0].id).toBe(initial.edition.entries[0].id);
    expect(result.edition.entries.slice(1)).toEqual(initial.edition.entries.slice(1));
  });
});
