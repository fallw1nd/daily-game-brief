import { describe, expect, it } from "vitest";
import {
  buildEnglishOverlay,
  buildManualRevisionEnglishOverlay,
  buildEnglishRepairOverlay,
  buildLocaleUnavailableStatus,
  deriveEntryIdsByEvent,
} from "./lib/bilingual-publisher.mjs";
import { editorialDecisionDigest, factsDigest, localeDigest } from "./lib/locale-digest.mjs";

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

function repairDraft(canonical) {
  return {
    schemaVersion: 1,
    locale: "en",
    editionId: canonical.id,
    factsDigest: factsDigest(canonical),
    archiveTitle: "Morning Brief | Test Game Announces a New Version",
    entries: canonical.entries.map((entry) => ({
      entryId: entry.id,
      headline: "Test Game Announces a New Version",
      summary: "The official source confirms a new version for the already verified platform set.",
      verification: "The official page was opened and supports the event, platform and timing stated here.",
      timeNote: "The official page timestamp falls within the fixed Beijing-time edition window.",
      regionLabel: null,
      releaseTypeLabel: null,
      sourceLabels: [],
    })),
    upcoming: [],
    sourceReport: null,
  };
}

describe("trusted bilingual publication planner", () => {
  it("merges a trusted news report only with a valid same-edition English baseline", () => {
    const canonical = canonicalEdition();
    const editorial = bilingualEditorial();
    editorial.locales.en.sourceReport = { checked: ["Nintendo"], limited: ["Primary body limited"], note: "Initial review." };
    const previous = buildEnglishOverlay({ canonical, editorial }).overlay;
    editorial.locales.en.sourceReport = { checked: ["IGN"], limited: [], note: "News continuation review." };
    const input = { canonical, previousCanonical: structuredClone(canonical), editorial, previousOverlay: previous, preservePublished: true, preserveNewsSourceReport: true };
    const merged = buildEnglishOverlay(input);
    expect(merged.status).toBe("available");
    expect(merged.overlay.sourceReport.checked).toEqual(["Nintendo", "IGN"]);
    expect(merged.overlay.sourceReport.limited).toEqual(["Primary body limited"]);
    expect(merged.overlay.entries).toEqual(previous.entries);
    expect(merged.overlay.factsDigest).toBe(previous.factsDigest);
    expect(merged.overlay.localeDigest).not.toBe(previous.localeDigest);
    expect(buildEnglishOverlay({ ...input, preserveNewsSourceReport: false }).overlay.sourceReport).toEqual(editorial.locales.en.sourceReport);
    expect(buildEnglishOverlay({ ...input, previousCanonical: { ...canonical, id: "different-edition" } }).overlay.sourceReport).toEqual(editorial.locales.en.sourceReport);
    const invalid = { ...previous, localeDigest: `sha256:${"f".repeat(64)}` };
    expect(buildEnglishOverlay({ ...input, previousOverlay: invalid }).overlay.sourceReport).toEqual(editorial.locales.en.sourceReport);
    expect(buildManualRevisionEnglishOverlay({ ...input, entryIdsByEvent: deriveEntryIdsByEvent(editorial) }).overlay.sourceReport).toEqual(editorial.locales.en.sourceReport);
  });
  it("binds an incoming calendar alias presentation to the retained Canonical ID", () => {
    const canonical = canonicalEdition();
    const editorial = bilingualEditorial();
    const item = { id: "retained-id", date: "09.01", title: { title_key: "test-game", title_en: "Test Game", title_zh_status: "unavailable" }, platforms: ["PC"], region: "美国", releaseType: "PC版发售", source: { kind: "primary", label: "Steam", url: "https://store.steampowered.com/app/123/" }, cover_status: "unavailable" };
    canonical.upcoming = [item];
    editorial.upcoming = [{ ...item, id: "incoming-alias", date: "2026-09-01", title: undefined, titleEn: "Test Game" }];
    editorial.locales.en.upcoming = [{ upcomingId: "incoming-alias", regionLabel: "United States", releaseTypeLabel: "PC release", sourceLabel: "Steam", coverAlt: "Test Game cover" }];
    const result = buildEnglishOverlay({ canonical, editorial });
    expect(result.errors).toEqual([]);
    expect(result.status).toBe("available");
    expect(result.overlay.upcoming).toEqual([{ upcomingId: "retained-id", regionLabel: "United States", releaseTypeLabel: "PC release", sourceLabel: "Steam", coverAlt: "Test Game cover" }]);
    canonical.upcoming[0] = { ...item, platforms: ["PC", "PS5"], releaseType: "多平台发售" };
    const broader = buildEnglishOverlay({ canonical, editorial });
    expect(broader.errors).toEqual([]);
    expect(broader.status).toBe("available");
    expect(broader.overlay.upcoming[0].releaseTypeLabel).toBe("Multi-platform release");
  });
  it("keeps existing English when a showcase revision only attaches references", () => {
    const canonical = canonicalEdition();
    const previous = buildEnglishOverlay({ canonical, editorial: bilingualEditorial() }).overlay;
    canonical.entries[0].showcaseRefs = [{ showcaseId: "direct", announcementId: "game", factIds: ["release"] }];
    const result = buildEnglishOverlay({ canonical, editorial: {}, previousOverlay: previous, preservePublished: true });
    expect(result.status).toBe("available");
    expect(result.overlay.entries).toEqual(previous.entries);
    expect(result.overlay.factsDigest).not.toBe(previous.factsDigest);
  });
  it("reconciles inserted, removed and reordered calendar identities without an English draft", () => {
    const canonical = canonicalEdition();
    const item = id => ({ id, date: "09.01", title: { title_key: id, title_en: "Test Game", title_zh_status: "unavailable" }, platforms: ["PC"], region: "全球", releaseType: "PC版发售", source: { kind: "primary", label: "Steam", url: "https://store.steampowered.com/app/123/" }, cover_status: "unavailable" });
    canonical.upcoming = [item("keep-a"), item("remove"), item("keep-b")];
    const previous = buildEnglishOverlay({ canonical, editorial: bilingualEditorial() }).overlay;
    previous.upcoming[0].coverAlt = "Reviewed Test Game artwork";
    canonical.upcoming = [item("keep-b"), item("insert"), item("keep-a")];
    const result = buildEnglishOverlay({ canonical, editorial: {}, previousOverlay: previous, preservePublished: true });
    expect(result.status).toBe("available");
    expect(result.overlay.upcoming.map(item => item.upcomingId)).toEqual(["keep-b", "insert", "keep-a"]);
    expect(result.overlay.upcoming[2].coverAlt).toBe("Reviewed Test Game artwork");
    expect(result.overlay.entries).toEqual(previous.entries);
    canonical.upcoming[1].region = "Spike Chunsoft英语发行地区";
    const unavailable = buildEnglishOverlay({ canonical, editorial: {}, previousOverlay: previous, preservePublished: true });
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.errors).toEqual(["upcoming[1].regionLabel: required English text is missing or too short"]);
  });

  it("retains manual English copy only when it shares the current facts baseline", () => {
    const canonical = canonicalEdition();
    const previous = buildEnglishOverlay({ canonical, editorial: bilingualEditorial() }).overlay;
    previous.entries[0].summary = "Manually reviewed English wording that must survive automatic supplement repair.";
    const result = buildEnglishRepairOverlay({ canonical, draft: repairDraft(canonical), retainedPresentation: previous });
    expect(result.status).toBe("available");
    expect(result.overlay.entries[0].summary).toBe(previous.entries[0].summary);
    expect(result.overlay.entries).toHaveLength(1);
  });

  it("uses the complete reviewed draft rather than stale retained copy after a same-ID fact correction", () => {
    const canonical = canonicalEdition();
    const previous = buildEnglishOverlay({ canonical, editorial: bilingualEditorial() }).overlay;
    previous.archiveTitle = "Morning Brief | Test Game Announces Console Plans";
    previous.entries[0].summary = "This old English presentation lists console platforms that are no longer in Canonical.";
    canonical.entries[0].platforms = ["PC (Steam)"];
    const draft = repairDraft(canonical);
    draft.entries[0].summary = "The current Canonical source confirms this version only for PC via Steam.";
    const result = buildEnglishRepairOverlay({ canonical, draft, retainedPresentation: previous });
    expect(result.status).toBe("available");
    expect(result.overlay.archiveTitle).toBe(draft.archiveTitle);
    expect(result.overlay.entries[0].summary).toBe(draft.entries[0].summary);
    expect(result.overlay.factsDigest).toBe(draft.factsDigest);
    expect(result.warnings).toContain("Retained English presentation was ignored because it is not bound to the current Canonical facts; the complete reviewed draft was used instead.");
  });

  it("carries reviewed manual copy in a current-bound supplement repair draft", () => {
    const canonical = canonicalEdition();
    const previous = buildEnglishOverlay({ canonical, editorial: bilingualEditorial() }).overlay;
    previous.entries[0].summary = "Manually reviewed English wording that must survive automatic supplement repair.";
    canonical.entries.push({ ...canonical.entries[0], id: `${canonical.id}-news-1` });
    const draft = repairDraft(canonical);
    draft.entries[0] = structuredClone(previous.entries[0]);
    const result = buildEnglishRepairOverlay({ canonical, draft, retainedPresentation: previous });
    expect(result.status).toBe("available");
    expect(result.overlay.entries[0].summary).toBe(previous.entries[0].summary);
    expect(result.overlay.entries).toHaveLength(2);
  });

  it.each([undefined, null, "", 42, "sha256:1234", `sha256:${"A".repeat(64)}`])("rejects a missing or malformed repair factsDigest: %s", (digest) => {
    const canonical = canonicalEdition();
    const draft = { ...repairDraft(canonical), factsDigest: digest };
    const result = buildEnglishRepairOverlay({ canonical, draft });
    expect(result.status).toBe("unavailable");
    expect(result.overlay).toBeNull();
    expect(result.errors).toContain("locale repair factsDigest must be sha256:<64 lowercase hex>");
  });

  it("rejects a formerly valid repair on every build after same-ID facts change", () => {
    const canonical = canonicalEdition();
    const draft = repairDraft(canonical);
    expect(buildEnglishRepairOverlay({ canonical, draft }).status).toBe("available");
    canonical.entries[0].platforms = ["PC (Steam)"];
    const currentPresentation = buildEnglishOverlay({ canonical, editorial: bilingualEditorial() }).overlay;
    for (const retainedPresentation of [null, currentPresentation]) {
      const result = buildEnglishRepairOverlay({ canonical, draft, retainedPresentation });
      expect(result.status).toBe("unavailable");
      expect(result.reasonCode).toBe("locale-repair-invalid");
      expect(result.overlay).toBeNull();
      expect(result.errors).toContain("locale repair factsDigest is stale for canonical facts");
    }
  });

  it("allows Chinese copy-only and media-only changes without replacing a repair facts baseline", () => {
    const canonical = canonicalEdition();
    const draft = repairDraft(canonical);
    canonical.entries[0].summary = "这里只调整中文表述，不改变事实。";
    canonical.entries[0].imageNote = "Updated media availability explanation.";
    const result = buildEnglishRepairOverlay({ canonical, draft });
    expect(result.status).toBe("available");
    expect(result.overlay.factsDigest).toBe(draft.factsDigest);
  });

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

  it("repairs English directly against final Canonical entry IDs after same-edition revisions", () => {
    const canonical = canonicalEdition();
    canonical.id = "2026-09-01-daily";
    canonical.period = "daily";
    canonical.entries.push({
      ...structuredClone(canonical.entries[0]),
      id: "2026-09-01-daily-news-1",
      title: { title_key: "preserved-story", title_en: "Preserved Story", title_zh_status: "unavailable" },
      headline: "保留自上一轮正式修订的新闻",
      summary: "该条目已经是正式 Canonical，但不再存在于最新 revision 的 eventKey 集合中。",
      sharedFactFrameDigest: `sha256:${"2".repeat(64)}`,
    });
    canonical.entries[0].id = "2026-09-01-daily-news-0";
    canonical.leadEntryId = canonical.entries[0].id;
    const draft = repairDraft(canonical);
    draft.archiveTitle = "Daily Brief | Final Canonical English Repair";
    draft.entries[1] = {
      ...draft.entries[1],
      headline: "A Previously Published Story Remains in the Final Edition",
      summary: "This presentation is keyed to the stable Canonical entry rather than a mutable revision event key.",
    };
    const result = buildEnglishRepairOverlay({ canonical, draft });
    expect(result.status).toBe("available");
    expect(result.overlay.entries.map((item) => item.entryId)).toEqual(canonical.entries.map((item) => item.id));
    expect(result.overlay.factsDigest).toBe(factsDigest(canonical));
  });

  it("rejects a Canonical-ID repair draft that omits a preserved entry", () => {
    const canonical = canonicalEdition();
    const draft = repairDraft(canonical);
    draft.entries = [];
    const result = buildEnglishRepairOverlay({ canonical, draft });
    expect(result.status).toBe("unavailable");
    expect(result.reasonCode).toBe("locale-repair-invalid");
    expect(result.summary).toContain("cover every canonical entry");
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


describe("manual same-edition English overlay", () => {
  function scenario() {
    const previousCanonical = canonicalEdition();
    previousCanonical.entries.push({ ...structuredClone(previousCanonical.entries[0]), id: "2026-08-30-am-news-1" });
    const full = bilingualEditorial();
    full.decisions.push({ ...structuredClone(full.decisions[0]), eventKey: "later-continuation" });
    full.locales.en.entries.push({ ...structuredClone(full.locales.en.entries[0]), eventKey: "later-continuation" });
    const previousOverlay = buildEnglishOverlay({ canonical: previousCanonical, editorial: full }).overlay;
    const canonical = structuredClone(previousCanonical);
    canonical.entries[0].headline = "《测试游戏》确认新版本";
    const editorial = bilingualEditorial();
    editorial.locales.en.entries[0].headline = "Test Game Confirms the New Version";
    return { canonical, previousCanonical, previousOverlay, editorial, entryIdsByEvent: { "event-test-game": canonical.entries[0].id } };
  }
  it("keeps unchanged continuation stories absent from the packet while applying reviewed changed copy", () => {
    const input = scenario();
    const result = buildManualRevisionEnglishOverlay(input);
    expect(result.status, result.summary).toBe("available");
    expect(result.overlay.entries).toHaveLength(2);
    expect(result.overlay.entries[0].headline).toBe("Test Game Confirms the New Version");
    expect(result.overlay.entries[1]).toEqual(input.previousOverlay.entries[1]);
  });
  it("removes old calendar rows and never carries custom labels across a changed fact", () => {
    const input = scenario();
    const item = id => ({ id, date: "09.01", title: { title_key: id, title_en: "Test Game", title_zh_status: "unavailable" }, platforms: ["PC"], region: "测试发行地区", releaseType: "PC版发售", source: { kind: "primary", label: "Steam", url: "https://store.steampowered.com/app/123/" }, cover_status: "unavailable" });
    input.previousCanonical.upcoming = [item("keep"), item("remove")];
    const full = bilingualEditorial();
    full.decisions.push({ ...structuredClone(full.decisions[0]), eventKey: "later-continuation" });
    full.locales.en.entries.push({ ...structuredClone(full.locales.en.entries[0]), eventKey: "later-continuation" });
    full.locales.en.upcoming = input.previousCanonical.upcoming.map(item => ({ upcomingId: item.id, regionLabel: "Verified distribution region", coverAlt: "Reviewed cover" }));
    input.previousOverlay = buildEnglishOverlay({ canonical: input.previousCanonical, editorial: full }).overlay;
    input.canonical.upcoming = [structuredClone(input.previousCanonical.upcoming[0])];
    const result = buildManualRevisionEnglishOverlay(input);
    expect(result.status, result.summary).toBe("available");
    expect(result.overlay.upcoming.map(item => item.upcomingId)).toEqual(["keep"]);
    expect(result.overlay.upcoming[0].coverAlt).toBe("Reviewed cover");
    input.canonical.upcoming[0].region = "另一发行地区";
    expect(buildManualRevisionEnglishOverlay(input).status).toBe("unavailable");
  });
  it.each(["sharedFactFrameDigest", "summary", "region", "headline"])("does not retain a stale omitted row after %s changes", field => {
    const input = scenario();
    input.canonical.entries[1][field] = field === "sharedFactFrameDigest" ? `sha256:${"2".repeat(64)}` : "changed";
    const result = buildManualRevisionEnglishOverlay(input);
    expect(result.status).toBe("unavailable");
    expect(result.errors.join(" ")).toContain("cover every canonical entry");
  });
  it.each(["id", "issueNumber", "windowEnd"])("rejects another edition identity in %s", field => {
    const input = scenario(); input.previousCanonical[field] = field === "issueNumber" ? 99 : "wrong";
    expect(buildManualRevisionEnglishOverlay(input).status).toBe("unavailable");
  });
  it("rejects an unbound prior English overlay", () => {
    const input = scenario(); input.previousOverlay.factsDigest = `sha256:${"0".repeat(64)}`;
    expect(buildManualRevisionEnglishOverlay(input).status).toBe("unavailable");
  });
  it("does not carry old source-report prose into a new review", () => {
    const input = scenario();
    input.previousOverlay.sourceReport = { checked: ["Official website"], limited: [], note: "Only the official website was checked." };
    input.previousOverlay.localeDigest = localeDigest(input.previousOverlay);
    input.canonical.sourceReport = { checked: ["Steam"], limited: ["Official website"], note: "The official website is inaccessible." };
    input.editorial.locales.en.sourceReport = null;
    const result = buildManualRevisionEnglishOverlay(input);
    expect(result.status, result.summary).toBe("available");
    expect(result.overlay.sourceReport).toBeUndefined();
  });
  it.each([null, { editionId: "wrong-edition" }])("accepts a complete fresh draft without a usable old overlay: %j", previousOverlay => {
    const canonical = canonicalEdition();
    const editorial = bilingualEditorial();
    const result = buildManualRevisionEnglishOverlay({ canonical, previousCanonical: canonical, previousOverlay, editorial, entryIdsByEvent: deriveEntryIdsByEvent(editorial) });
    expect(result.status, result.summary).toBe("available");
    expect(result.overlay.entries).toHaveLength(1);
  });
  it("does not silently retain a changed story without its English draft", () => {
    const input = scenario(); delete input.editorial.locales;
    expect(buildManualRevisionEnglishOverlay(input).status).toBe("unavailable");
  });
});


it("keeps an English archive title longer than the Chinese limit available", () => {
  const canonical = canonicalEdition();
  const before = structuredClone(canonical);
  const editorial = bilingualEditorial();
  editorial.locales.en.archiveTitle = "Morning Brief | Test Game Announces a New Version Across Supported Platforms";
  expect([...editorial.locales.en.archiveTitle].length).toBeGreaterThan(40);
  const result = buildEnglishOverlay({ canonical, editorial });
  expect(result.status).toBe("available");
  expect(result.overlay.archiveTitle).toBe(editorial.locales.en.archiveTitle);
  expect(canonical).toEqual(before);
});
