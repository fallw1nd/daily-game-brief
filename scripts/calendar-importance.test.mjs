// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyCalendarImportance, buildCalendarInterestHistory } from "./lib/calendar-importance.mjs";
import { aggregateCalendarLeads, normalizeCalendarTitle } from "./lib/release-calendar-identity.mjs";
import { boundCalendarReport, parseReleaseSource } from "./lib/release-calendar-discovery.mjs";
import { buildCalendarWorkPages } from "./lib/calendar-work-pages.mjs";
import { collectCalendarPrimaryEvidence } from "./lib/calendar-primary-evidence.mjs";

const settings = (importance = {}, extra = {}) => ({
  maxCandidates: 100,
  importance: {
    enabled: true,
    explorationCandidates: 0,
    reviewLinkBudget: 4,
    sourceSignals: {
      "gamesradar-calendar": { level: "medium", family: "gamesradar", reason: "editorial-calendar" },
    },
    ...importance,
  },
  ...extra,
});
const candidate = (title, extra = {}) => ({
  title, date: "2026-10-25", platforms: ["PC"], sourceId: "steam-calendar", family: "steam",
  sources: ["steam-calendar"], knownTitle: false, crossSource: false, priority: 1,
  identity: { key: `name:${normalizeCalendarTitle(title)}`, registryIds: [] },
  observations: [{ title, sourceId: "steam-calendar", family: "steam", platforms: ["PC"], date: "2026-10-25", url: `https://store.example/${normalizeCalendarTitle(title)}` }],
  ...extra,
});
const report = (rows, extra = {}) => ({
  editionDate: "2026-10-22",
  window: { startInclusive: "2026-10-23", endInclusive: "2026-11-06" },
  candidates: rows, allCandidates: rows, coverage: [], reviewLinks: [], omittedCandidates: 0,
  ...extra,
});
const history = (...titles) => titles.map((title, index) => ({
  names: [normalizeCalendarTitle(title)], registryIds: [], entryId: `story-${index}`, editionId: "2026-10-21-daily",
}));
const titles = (rows) => rows.map(row => row.title).sort();
const byTitle = (result, title) => result.allCandidates.find(row => row.title === title);
const fromSources = (title, sources) => candidate(title, {
  sourceId: sources[0].id,
  sources: sources.map(source => source.id),
  observations: sources.map(source => ({ title, sourceId: source.id, family: source.family, platforms: ["PC"], date: "2026-10-25" })),
});
const edition = (date, entries, extra = {}) => ({ id: `${date}-daily`, date, entries, ...extra });
const entry = (id, title, extra = {}) => ({
  id, title: { title_key: id, title_en: title }, section: "features", platforms: ["PC"],
  headline: `${title} has a confirmed update`, summary: "Substantive reporting of the confirmed update.",
  sources: [{ url: `https://official.example/${id}`, kind: "primary" }],
  ...extra,
});

describe("calendar importance admission", () => {
  it("preserves the legacy report when importance admission is disabled", () => {
    const input = report([candidate("Legacy game")]);
    expect(applyCalendarImportance(input, { config: settings({ enabled: false }) })).toEqual(input);
    expect(applyCalendarImportance(input, { config: { maxCandidates: 100 } })).toEqual(input);
  });

  it("does not mistake known translations, cross-source coverage, store priority or a popular source name for importance", () => {
    const rows = [
      candidate("Registered game", { knownTitle: true, identity: { key: "registry:registered", registryIds: ["registered"] } }),
      candidate("Many stores", { crossSource: true, sources: ["steam-calendar", "nintendo-coming"] }),
      candidate("High priority store", { priority: 999 }),
      candidate("Popular URL is not a signal", { sourceId: "steam-popular", sources: ["steam-popular"], observations: [{ sourceId: "steam-popular", family: "steam" }] }),
      candidate("All weak flags", { knownTitle: true, crossSource: true, priority: 999 }),
    ];
    const result = applyCalendarImportance(report(rows), { config: settings() });
    expect(result.admittedCandidates).toEqual([]);
    expect(result.candidates).toEqual([]);
    expect(result.allCandidates).toHaveLength(rows.length);
    expect(result.allCandidates.every(row => row.importance.decision === "candidate")).toBe(true);
    expect(result.allCandidates.every(row => Array.isArray(row.importance.reasons))).toBe(true);
  });

  it("admits existing baseline items but never promotes an unknown game solely because its dates conflict", () => {
    const result = applyCalendarImportance(report([
      candidate("Existing baseline", { inBaseline: true }),
      candidate("Changed baseline", { inBaseline: true, baselineChanged: true, dateConflict: true }),
      candidate("Unknown conflicting dates", { dateConflict: true, dateConflictStatus: "conflict" }),
      candidate("Unknown uncertain dates", { dateConflictUncertain: true, dateConflictStatus: "uncertain" }),
    ]), { config: settings() });
    expect(titles(result.admittedCandidates)).toEqual(["Changed baseline", "Existing baseline"]);
    expect(byTitle(result, "Unknown conflicting dates").importance.decision).toBe("candidate");
    expect(byTitle(result, "Unknown uncertain dates").importance.decision).toBe("candidate");
    expect(result.admittedCandidates.every(row => row.importance.decision === "selected")).toBe(true);
  });

  it("uses exact normalized recent game identity, not franchise substrings or edition-word stripping", () => {
    const rows = [candidate("Ｓｔａｒ™: Quest"), candidate("Star Quest 2"), candidate("Star Quest Deluxe"), candidate("Quest")];
    const result = applyCalendarImportance(report(rows), { config: settings(), history: history("Star Quest") });
    expect(titles(result.admittedCandidates)).toEqual(["Ｓｔａｒ™: Quest"]);
    expect(result.admittedCandidates[0].importance.decision).toBe("selected");
    expect(result.admittedCandidates[0].importance.reasons.length).toBeGreaterThan(0);
    expect(result.allCandidates.filter(row => row.importance.decision === "candidate")).toHaveLength(3);
  });

  it("requires two independent configured medium families, not duplicate pages or adapters from one publisher", () => {
    const config = settings({ sourceSignals: {
      "gamesradar-calendar": { level: "medium", family: "gamesradar", reason: "editorial-calendar" },
      "gamesradar-list": { level: "medium", family: "gamesradar", reason: "editorial-list" },
      "independent-preview": { level: "medium", family: "independent", reason: "editorial-preview" },
    } });
    const gamesradar = { id: "gamesradar-calendar", family: "gamesradar" };
    const rows = [
      fromSources("One medium", [gamesradar]),
      fromSources("Duplicate medium", [gamesradar, gamesradar]),
      fromSources("Same publisher", [gamesradar, { id: "gamesradar-list", family: "different-observation-label" }]),
      fromSources("Independent coverage", [gamesradar, { id: "independent-preview", family: "independent" }]),
    ];
    const result = applyCalendarImportance(report(rows), { config });
    expect(titles(result.admittedCandidates)).toEqual(["Independent coverage"]);
    expect(result.allCandidates.filter(row => row.importance.decision === "candidate")).toHaveLength(3);
  });

  it("keeps a configured strong signal even when an earlier medium signal belongs to the same family", () => {
    const config = settings({ sourceSignals: {
      "publisher-calendar": { level: "medium", family: "publisher", reason: "calendar" },
      "publisher-feature": { level: "strong", family: "publisher", reason: "editorial-feature" },
    } });
    const medium = { id: "publisher-calendar", family: "publisher" };
    const strong = { id: "publisher-feature", family: "publisher" };
    for (const sources of [[strong], [medium, strong], [strong, medium]]) {
      const result = applyCalendarImportance(report([fromSources("Featured Game", sources)]), { config });
      expect(titles(result.admittedCandidates)).toEqual(["Featured Game"]);
      expect(result.admittedCandidates[0].importance.signals.some(signal => signal.level === "strong")).toBe(true);
    }
  });

  it("does not treat registry membership alone as an exact match to recent news", () => {
    const rows = [candidate("Unrelated Name", { identity: { key: "registry:shared", registryIds: ["shared"] } })];
    const result = applyCalendarImportance(report(rows), {
      config: settings(),
      history: [{ names: ["coveredgame"], registryIds: ["shared"], editionId: "2026-10-21-daily", entryId: "covered" }],
    });
    expect(result.admittedCandidates).toEqual([]);
  });

  it("flags weak editorial signals and platform breadth for attention without auto-admitting them", () => {
    const result = applyCalendarImportance(report([
      fromSources("One editorial signal", [{ id: "gamesradar-calendar", family: "gamesradar" }]),
      candidate("Multiple platforms", { platforms: ["PC", "PS5"] }),
      candidate("Only a storefront", { knownTitle: true, crossSource: true, priority: 999 }),
      candidate("Already admitted", { inBaseline: true, platforms: ["PC", "PS5"] }),
    ]), { config: settings() });
    expect(titles(result.admittedCandidates)).toEqual(["Already admitted"]);
    for (const title of ["One editorial signal", "Multiple platforms"]) {
      expect(byTitle(result, title).importance).toMatchObject({ decision: "candidate", needsAttention: true });
    }
    expect(byTitle(result, "Only a storefront").importance).toMatchObject({ decision: "candidate", needsAttention: false });
    expect(byTitle(result, "Already admitted").importance).toMatchObject({ decision: "selected", needsAttention: false });
    expect(result.importanceSummary).toMatchObject({ needsAttention: 2, candidateOnly: 3, selected: 1 });
  });

  it("keeps the full discovery audit separate from admitted tasks and the capped inline preview", () => {
    const rows = Array.from({ length: 7 }, (_, index) => candidate(`Covered game ${index}`));
    rows.push(candidate("Unselected raw row"));
    const input = report(rows, { candidates: rows.slice(0, 1), omittedCandidates: rows.length - 1 });
    const before = structuredClone(input);
    const result = applyCalendarImportance(input, { config: settings({}, { maxCandidates: 2 }), history: history(...rows.slice(0, 7).map(row => row.title)) });
    expect(result.admittedCandidates).toHaveLength(7);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every(row => result.admittedCandidates.includes(row))).toBe(true);
    expect(result.allCandidates).toHaveLength(8);
    expect(result.importanceSummary).toMatchObject({ discovered: 8, selected: 7, exploration: 0, candidateOnly: 1 });
    expect(result.admittedCandidates.some(row => row.title === "Unselected raw row")).toBe(false);
    expect(input).toEqual(before);
  });
});

describe("explicit GamesRadar editorial spotlights", () => {
  const url = "https://www.gamesradar.com/video-game-release-dates/";
  const source = { id: "gamesradar-calendar", family: "gamesradar", adapter: "calendar", kind: "discovery", platform: "multiplatform", url, priority: 3 };
  const config = settings({ sourceSignals: {
    "gamesradar-calendar": { level: "medium", family: "gamesradar", reason: "editorial-calendar", spotlightUrl: url },
  } });
  const listing = title => `<ul><li>${title} (PC, PS5) – October 25</li></ul>`;

  it("marks only valid dated game rows beneath an exact biggest-games heading", () => {
    const parsed = parseReleaseSource([
      '<h2>Biggest games of October 2026</h2>', listing("Spotlight Game"), '<ul><li>Unstructured menu text</li></ul>',
      '<h3>October 2026</h3>', listing("Ordinary Game"),
      '<h3>Our biggest games of October 2026</h3>', listing("Prefixed Heading Game"),
      '<h3>Biggest games of October 2026 roundup</h3>', listing("Suffixed Heading Game"),
      '<h3>BIGGEST GAMES OF NOVEMBER 2026</h3>', listing("Case-insensitive Spotlight"),
    ].join(""), source, "2026-10-22");
    expect(parsed.records).toHaveLength(5);
    expect(parsed.records.find(row => row.title === "Spotlight Game")).toMatchObject({
      date: "2026-10-25", editorialSpotlight: { section: "Biggest games of October 2026", sourceUrl: url },
    });
    expect(parsed.records.find(row => row.title === "Case-insensitive Spotlight").editorialSpotlight.section).toBe("BIGGEST GAMES OF NOVEMBER 2026");
    for (const title of ["Ordinary Game", "Prefixed Heading Game", "Suffixed Heading Game"]) {
      expect(parsed.records.find(row => row.title === title)).not.toHaveProperty("editorialSpotlight");
    }
  });

  it("preserves spotlight provenance through deduplication and aggregation before admitting it as strong", () => {
    const parsed = parseReleaseSource(
      '<h3>October 2026</h3>' + listing("Repeated Game") +
      '<h3>Biggest games of October 2026</h3>' + listing("Repeated Game"), source, "2026-10-22");
    expect(parsed.records).toHaveLength(2);
    const leads = aggregateCalendarLeads(parsed.records);
    expect(leads).toHaveLength(1);
    expect(leads[0].observations).toHaveLength(2);
    expect(leads[0].observations.filter(row => row.editorialSpotlight)).toHaveLength(1);
    const result = applyCalendarImportance(report(leads), { config });
    expect(titles(result.admittedCandidates)).toEqual(["Repeated Game"]);
    expect(result.admittedCandidates[0].importance.signals).toEqual([{
      level: "strong", family: "gamesradar", reason: "explicit-editorial-spotlight", evidence: `${url}#Biggest games of October 2026`,
    }]);
  });

  it("keeps ordinary month headings and historical records without section evidence at medium only", () => {
    const parsed = parseReleaseSource('<h3>October 2026</h3>' + listing("Ordinary Game"), source, "2026-10-22");
    const legacy = { title: "Historical Fixture", date: "2026-10-25", platforms: ["PC"], sourceId: source.id, family: source.family, url };
    const result = applyCalendarImportance(report(aggregateCalendarLeads([...parsed.records, legacy])), { config });
    expect(result.admittedCandidates).toEqual([]);
    expect(result.allCandidates).toHaveLength(2);
    expect(result.allCandidates.every(row => row.importance.decision === "candidate")).toBe(true);
    expect(result.allCandidates.every(row => row.importance.signals.length === 1 && row.importance.signals[0].level === "medium")).toBe(true);
  });

  it("requires both the configured exact source URL and explicit section before upgrading a medium signal", () => {
    const invalidEvidence = [
      { section: "Biggest games of October 2026", sourceUrl: "https://www.gamesradar.com.evil.example/video-game-release-dates/" },
      { section: "Biggest games of October 2026", sourceUrl: "https://www.gamesradar.com/another-list/" },
      { section: "Biggest games of October 2026" },
      { sourceUrl: url },
      { section: "October 2026", sourceUrl: url },
      { section: "Biggest games of October 2026 and more", sourceUrl: url },
    ];
    for (const editorialSpotlight of invalidEvidence) {
      const leads = aggregateCalendarLeads([{ title: "Not proven spotlight", sourceId: source.id, family: source.family, url, platforms: ["PC"], editorialSpotlight }]);
      const result = applyCalendarImportance(report(leads), { config });
      expect(result.admittedCandidates).toEqual([]);
      expect(result.allCandidates[0].importance.signals).toMatchObject([{ level: "medium", reason: "editorial-calendar" }]);
    }
    const valid = aggregateCalendarLeads([{ title: "Unconfigured spotlight", sourceId: source.id, family: source.family, url, platforms: ["PC"], editorialSpotlight: { section: "Biggest games of October 2026", sourceUrl: url } }]);
    const withoutApprovedUrl = applyCalendarImportance(report(valid), { config: settings() });
    expect(withoutApprovedUrl.admittedCandidates).toEqual([]);
    expect(withoutApprovedUrl.allCandidates[0].importance.signals[0].level).toBe("medium");
  });
});

describe("bounded calendar exploration", () => {
  it("keeps exploration to four tasks while giving every represented platform family a turn", () => {
    const rows = [
      ...Array.from({ length: 40 }, (_, index) => candidate(`PC game ${index}`)),
      ...["PS5", "Xbox Series X", "Nintendo Switch 2"].flatMap(platform =>
        Array.from({ length: 4 }, (_, index) => candidate(`${platform} game ${index}`, { platforms: [platform], platformHints: [platform], observations: [{ sourceId: "store", platforms: [platform] }] }))),
    ];
    const result = applyCalendarImportance(report(rows), { config: settings({ explorationCandidates: 4 }) });
    expect(result.admittedCandidates).toHaveLength(4);
    expect(result.admittedCandidates.every(row => row.importance.decision === "exploration")).toBe(true);
    expect(new Set(result.admittedCandidates.flatMap(row => row.platforms)).size).toBe(4);
    expect(result.allCandidates.filter(row => row.importance.decision === "candidate")).toHaveLength(rows.length - 4);
  });

  it("guarantees one cold-start slot beside three positive-signal explorations every date", () => {
    const rows = Array.from({ length: 8 }, (_, index) => fromSources(`Promising ${index}`, [{ id: "gamesradar-calendar", family: "gamesradar" }]));
    rows.push(candidate("Cold opportunity"));
    for (let day = 22; day <= 28; day++) {
      const result = applyCalendarImportance(report(rows, { editionDate: `2026-10-${day}` }), { config: settings({ explorationCandidates: 4 }) });
      expect(result.admittedCandidates).toHaveLength(4);
      expect(byTitle(result, "Cold opportunity").importance.decision).toBe("exploration");
      expect(result.admittedCandidates.filter(row => row.importance.signals.length > 0)).toHaveLength(3);
      expect(result.admittedCandidates.every(row => row.importance.decision === "exploration")).toBe(true);
    }
  });

  it("is repeatable for one date but rotates a single-platform exploration pool across dates", () => {
    const rows = Array.from({ length: 37 }, (_, index) => candidate(`Discovery ${String(index).padStart(2, "0")}`));
    const config = settings({ explorationCandidates: 4 });
    const first = applyCalendarImportance(report(rows), { config });
    expect(applyCalendarImportance(report(rows), { config })).toEqual(first);
    const explored = new Set();
    for (let day = 22; day <= 28; day++) {
      const result = applyCalendarImportance(report(rows, { editionDate: `2026-10-${day}` }), { config });
      expect(result.admittedCandidates).toHaveLength(4);
      result.admittedCandidates.forEach(row => explored.add(row.title));
    }
    expect(explored.size).toBeGreaterThan(4);
  });

  it("rotates a seven-link discovery list instead of permanently repeating the same four", () => {
    const reviewLinks = Array.from({ length: 7 }, (_, index) => ({ url: `https://official.example/rotation-${index}` }));
    const observed = new Set();
    for (let day = 22; day <= 28; day++) {
      const result = applyCalendarImportance(report([], { reviewLinks, editionDate: `2026-10-${day}` }), { config: settings() });
      expect(result.reviewLinks).toHaveLength(4);
      result.reviewLinks.forEach(link => observed.add(link.url));
    }
    expect(observed.size).toBe(7);
  });

  it("does not bypass the review-link budget when many URLs also belong to admitted games", () => {
    const reviewLinks = Array.from({ length: 8 }, (_, index) => ({ url: `https://official.example/covered-${index}` }));
    const rows = reviewLinks.map((link, index) => candidate(`Covered ${index}`, { url: link.url, inBaseline: true }));
    const result = applyCalendarImportance(report(rows, { reviewLinks }), { config: settings() });
    expect(result.admittedCandidates).toHaveLength(8);
    expect(result.reviewLinks).toHaveLength(4);
    expect(result.deferredReviewLinks).toHaveLength(4);
    expect(result.importanceSummary).toMatchObject({ reviewLinksSelected: 4, reviewLinksDeferred: 4 });
  });

  it("caps review links and retains deferred raw leads outside editorial work pages and the inline packet", () => {
    const rows = Array.from({ length: 30 }, (_, index) => candidate(`Unknown game ${index}`));
    const reviewLinks = Array.from({ length: 14 }, (_, index) => ({ sourceId: "official-blog", url: `https://official.example/release-${index}`, dateStatus: "in_window", platformHints: ["PS5"] }));
    const result = applyCalendarImportance(report(rows, { reviewLinks }), { config: settings({ explorationCandidates: 4 }) });
    expect(result.reviewLinks).toHaveLength(4);
    expect(result.deferredReviewLinks).toHaveLength(10);
    expect(new Set([...result.reviewLinks, ...result.deferredReviewLinks].map(row => row.url)).size).toBe(14);
    const { manifest, pages } = buildCalendarWorkPages(result);
    const tasks = pages.flatMap(page => JSON.parse(page.text).items);
    expect(manifest.totalTasks).toBe(8);
    expect(tasks.filter(item => item.kind === "candidate")).toHaveLength(4);
    expect(tasks.filter(item => item.kind === "review-link")).toHaveLength(4);
    expect(boundCalendarReport(result)).not.toHaveProperty("allCandidates");
    expect(boundCalendarReport(result)).not.toHaveProperty("admittedCandidates");
    expect(boundCalendarReport(result)).not.toHaveProperty("deferredReviewLinks");
  });
});

describe("importance before primary evidence and editorial tasks", () => {
  it("never fetches or queues candidate-only rows even when they contain official URLs or date conflicts", async () => {
    const official = index => `https://www.nintendo.com/us/store/products/game-${index}/`;
    const rows = Array.from({ length: 12 }, (_, index) => candidate(`Cold game ${index}`, {
      url: official(index), observations: [{ sourceId: "nintendo-coming", url: official(index), platforms: ["Nintendo Switch 2"] }],
      dateConflict: true,
    }));
    rows.push(candidate("Admitted baseline", { url: official("baseline"), observations: [{ url: official("baseline") }], inBaseline: true }));
    const gated = applyCalendarImportance(report(rows), { config: settings() });
    const calls = [];
    const enriched = await collectCalendarPrimaryEvidence(gated, { fetcher: async url => {
      calls.push(url);
      return new Response(`<main><h1>Admitted baseline</h1><p>${"Confirmed October 25 release for Nintendo Switch 2. ".repeat(5)}</p></main>`);
    } });
    expect(calls).toEqual([official("baseline")]);
    expect(enriched.primaryEvidenceSummary).toMatchObject({ attempted: 1, opened: 1, deferred: 0 });
    expect(enriched.allCandidates).toHaveLength(13);
    expect(enriched.admittedCandidates).toHaveLength(1);
    const { pages } = buildCalendarWorkPages(enriched);
    const tasks = pages.flatMap(page => JSON.parse(page.text).items);
    expect(tasks.filter(task => task.kind === "candidate").map(task => task.candidate.title)).toEqual(["Admitted baseline"]);
    expect(tasks.filter(task => task.kind === "primary-evidence")).toHaveLength(1);
    expect(JSON.stringify(tasks)).not.toContain("Cold game");
    const inline = boundCalendarReport(enriched);
    expect(inline).not.toHaveProperty("allCandidates");
    expect(inline).not.toHaveProperty("admittedCandidates");
    expect(inline).not.toHaveProperty("deferredReviewLinks");
    expect(JSON.stringify(inline)).not.toContain("Cold game");
  });

  it("does not fall back to the raw discovery pool when no candidate is admitted", async () => {
    const gated = applyCalendarImportance(report([candidate("Cold only", { url: "https://www.nintendo.com/us/store/products/cold/" })]), { config: settings() });
    const enriched = await collectCalendarPrimaryEvidence(gated, { fetcher: async () => { throw new Error("Candidate-only pool must not trigger a fetch"); } });
    expect(enriched.primaryEvidenceSummary.attempted).toBe(0);
    expect(enriched.admittedCandidates).toEqual([]);
    const { manifest, pages } = buildCalendarWorkPages(enriched);
    expect(manifest.totalTasks).toBe(0);
    expect(pages.flatMap(page => JSON.parse(page.text).items)).toEqual([]);
  });
});

describe("recent calendar-interest history", () => {
  it("derives interest only from dated game stories, never past calendar rows or future/expired editions", () => {
    const editions = [
      edition("2026-10-21", [entry("real-story", "Real Game", { subject: { kind: "game", key: "real-story" } })], { upcoming: [entry("calendar-only", "Calendar Only Game")] }),
      edition("2026-10-23", [entry("future-story", "Future Game", { subject: { kind: "game", key: "future-story" } })]),
      edition("2026-01-01", [entry("expired-story", "Expired Game", { subject: { kind: "game", key: "expired-story" } })]),
    ];
    const result = buildCalendarInterestHistory(editions, { editionDate: "2026-10-22" });
    expect(result.map(item => item.entryId)).toEqual(["real-story"]);
    expect(result[0]).toMatchObject({ editionId: "2026-10-21-daily", names: expect.arrayContaining(["realgame"]) });
    expect(result[0].registryIds).toEqual(expect.any(Array));
  });

  it("excludes company and topic subjects even when an old title field is present", () => {
    const editions = [edition("2026-10-21", [
      entry("confirmed-game", "Confirmed Game", { subject: { kind: "game", key: "confirmed-game" } }),
      entry("company-story", "Old Game Mention", { subject: { kind: "entity", key: "new-studio" } }),
      entry("topic-story", "Another Game", { subject: { kind: "topic", key: null } }),
      entry("registered-company", "Studio Company"),
      { id: "headline-only", headline: "Some game gets an update" },
    ])];
    const titleRegistry = { translations: { "registered-company": { subjectType: "entity", titleEn: "Studio Company" } } };
    const result = buildCalendarInterestHistory(editions, { editionDate: "2026-10-22", titleRegistry });
    expect(result.map(item => item.entryId)).toEqual(["confirmed-game"]);
  });

  it("requires substantive sourced reporting and does not turn rumor or industry entries into game interest", () => {
    const editions = [edition("2026-10-21", [
      entry("explicit-game", "Explicit Game", { subjectType: "game", platforms: [] }),
      entry("unsourced", "Unsourced Game", { subjectType: "game", sources: [] }),
      entry("empty-summary", "Empty Summary Game", { subjectType: "game", summary: "" }),
      entry("empty-headline", "Empty Headline Game", { subjectType: "game", headline: "" }),
      entry("platformless", "Unconfirmed Subject", { platforms: [] }),
      entry("rumor", "Rumored Game", { subjectType: "game", section: "rumors" }),
      entry("industry", "Industry Game Mention", { subjectType: "game", section: "industry" }),
    ])];
    const result = buildCalendarInterestHistory(editions, { editionDate: "2026-10-22" });
    expect(result.map(item => item.entryId)).toEqual(["explicit-game"]);
  });

  it("accepts a historical game without platform metadata only with an exact quoted game subject and game-specific reporting", () => {
    const editions = [edition("2026-10-21", [
      entry("ace", "ACE", { platforms: [], headline: "《ACE》公布新玩法", summary: "游戏展示了新的战斗机制。" }),
      entry("chinese-title", "Star Quest", {
        title: { title_key: "star-quest", title_en: "Star Quest", title_zh_cn: "星际任务" },
        platforms: [], headline: "《星际任务》公布上线时间", releaseType: "正式发售",
      }),
      entry("quoted-nongame", "Studio News", { platforms: [], headline: "《Studio News》公布计划", summary: "The organization announced its business plans." }),
      entry("substring", "ACE", { platforms: [], headline: "《ACE 2》公布新玩法", summary: "游戏展示了新的战斗机制。" }),
      entry("unquoted", "ACE", { platforms: [], headline: "ACE公布新玩法", summary: "游戏展示了新的战斗机制。" }),
    ])];
    const result = buildCalendarInterestHistory(editions, { editionDate: "2026-10-22" });
    expect(result.map(item => item.entryId)).toEqual(["ace", "chinese-title"]);
    expect(result[0].names).toContain("ace");
    expect(result[1].names).toContain("星际任务");
  });

  it("does not mistake platform metadata on a Steam platform story for an explicit game subject", () => {
    const editions = [edition("2026-10-21", [entry("steam-platform", "Steam", {
      section: "features", platforms: ["PC"], headline: "Steam调整游戏商店展示规则",
      summary: "Steam平台调整游戏商店的展示规则与开发者工具。", releaseType: "平台更新",
    })])];
    expect(buildCalendarInterestHistory(editions, { editionDate: "2026-10-22" })).toEqual([]);
  });

  it("keeps explicit company and topic overrides above quoted-title game cues", () => {
    const gameCue = { platforms: [], headline: "《ACE》开发者披露公司计划", summary: "公司计划涉及游戏的后续开发。" };
    const editions = [edition("2026-10-21", [
      entry("company-quoted", "ACE", { ...gameCue, subject: { kind: "entity", key: "studio" } }),
      entry("topic-quoted", "ACE", { ...gameCue, subject: { kind: "topic", key: null } }),
      entry("legacy-company-quoted", "ACE", { ...gameCue, subjectType: "entity" }),
    ])];
    expect(buildCalendarInterestHistory(editions, { editionDate: "2026-10-22" })).toEqual([]);
  });

  it("honors a configured lookback and retains multilingual exact identities without admitting sequels", () => {
    const editions = [
      edition("2026-10-16", [entry("star-quest", "Star Quest", { subject: { kind: "game", key: "star-quest" }, title: { title_key: "star-quest", title_en: "Star Quest", title_zh_cn: "星际任务" } })]),
      edition("2026-10-14", [entry("too-old", "Old Game", { subject: { kind: "game", key: "too-old" } })]),
    ];
    const titleRegistry = { translations: { "star-quest": { titleEnAliases: ["Star Quest", "スタークエスト"] } } };
    const recent = buildCalendarInterestHistory(editions, { editionDate: "2026-10-22", lookbackDays: 7, titleRegistry });
    expect(recent).toHaveLength(1);
    expect(recent[0].names).toEqual(expect.arrayContaining(["starquest", "星际任务"]));
    const selected = applyCalendarImportance(report([candidate("星际任务"), candidate("Star Quest 2")]), { config: settings(), history: recent });
    expect(titles(selected.admittedCandidates)).toEqual(["星际任务"]);
  });
});
