// @vitest-environment node
import { expect, it } from "vitest";
import { collectCalendarPrimaryEvidence, officialCalendarUrl } from "./lib/calendar-primary-evidence.mjs";
import { buildCalendarWorkPages } from "./lib/calendar-work-pages.mjs";
import { boundCalendarReport } from "./lib/release-calendar-discovery.mjs";
import { gitBlobSha } from "./lib/edition-state.mjs";

it("opens and pins official details once, including inherited releases absent from discovery", async () => {
  const url = "https://www.xbox.com/en-us/games/store/game/123";
  const baselineUrl = "https://www.nintendo.com/us/store/products/game/";
  const calls = [];
  const candidate = { title: "Game", url, platforms: ["PC"], observations: [{ url }] };
  const report = await collectCalendarPrimaryEvidence({ editionDate: "2026-10-04", candidates: [candidate], allCandidates: [candidate, { ...candidate, title: "Alias" }], reviewLinks: [] }, {
    baseline: [{ id: "old", source: { url: baselineUrl } }],
    fetcher: async url => { calls.push(url); return new Response(`<main><h1>Game</h1><p>${"October 10, 2026. PC release. ".repeat(8)}</p></main>`); },
  });
  expect(calls).toEqual([baselineUrl, url]);
  expect(report.primaryEvidenceSummary).toMatchObject({ attempted: 2, opened: 2, deferred: 0 });
  const { pages } = buildCalendarWorkPages(report);
  const items = pages.flatMap(page => JSON.parse(page.text).items);
  expect(items.filter(row => row.kind === "primary-evidence")).toHaveLength(2);
  expect(items.find(row => row.kind === "baseline-check").baseline.primaryEvidenceUrls).toEqual([baselineUrl]);
  expect(items.find(row => row.kind === "candidate").candidate.primaryEvidenceUrls).toEqual([url]);
  expect(items.find(row => row.kind === "candidate").candidate).not.toHaveProperty("primaryEvidence");
  expect(JSON.stringify(boundCalendarReport(report))).not.toContain("evidenceText");
  pages.forEach(page => { expect(page.blobSha).toBe(gitBlobSha(page.text)); expect(page.chars).toBeLessThanOrEqual(24000); });
});

it("retains cap, fetch and unreadable-page failures without turning them into verified releases", async () => {
  const rows = [1, 2, 3].map(id => ({ title: `Game ${id}`, url: `https://www.nintendo.com/us/store/products/game-${id}/` }));
  let count = 0;
  const report = await collectCalendarPrimaryEvidence({ editionDate: "2026-10-04", allCandidates: rows }, { maxRequests: 2,
    fetcher: async () => { if (++count === 1) throw new Error("test outage"); return new Response("<main>Age check</main>"); },
  });
  expect(report.primaryEvidenceSummary).toMatchObject({ attempted: 2, opened: 0, failed: 2, deferred: 1 });
  expect(report.allCandidates.flatMap(row => row.primaryEvidence).map(row => row.status).sort()).toEqual(["deferred", "failed", "limited"]);
  expect(report).not.toHaveProperty("upcoming");
});

it("rejects nonofficial, credentialed and internal URLs without fetching them", async () => {
  for (const url of ["http://store.steampowered.com/app/1", "https://store.steampowered.com.evil.test/", "https://user:pass@store.steampowered.com/app/1", "https://127.0.0.1/", "https://www.xbox.com:8443/"]) expect(officialCalendarUrl(url)).toBeNull();
  const report = await collectCalendarPrimaryEvidence({ editionDate: "2026-10-04", allCandidates: [{ url: "https://evil.test" }] }, { fetcher: async () => { throw new Error("must not fetch"); } });
  expect(report.primaryEvidenceSummary.attempted).toBe(0);
});

it("pins region-specific Steam detail instead of stopping at an age gate, and rejects mismatched product IDs", async () => {
  const report = { editionDate: "2026-10-04", allCandidates: [{ url: "https://store.steampowered.com/app/123/" }] };
  let fetched;
  const result = await collectCalendarPrimaryEvidence(report, { fetcher: async url => {
    fetched = url;
    return new Response(JSON.stringify({ 123: { success: true, data: { steam_appid: 123, name: "Game", type: "game", release_date: { coming_soon: true, date: "Oct 12, 2026" }, platforms: { windows: true } } } }));
  } });
  expect(fetched).toBe("https://store.steampowered.com/api/appdetails?appids=123&cc=us&l=english");
  expect(result.allCandidates[0].primaryEvidence[0]).toMatchObject({ status: "opened", region: "US", fetchedUrl: fetched });
  const failed = await collectCalendarPrimaryEvidence(report, { fetcher: async () => new Response(JSON.stringify({ 123: { success: true, data: { steam_appid: 999 } } })) });
  expect(failed.primaryEvidenceSummary).toMatchObject({ opened: 0, failed: 1 });
});
