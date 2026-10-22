import { expect, it } from "vitest";
import { buildCalendarWorkPages } from "./lib/calendar-work-pages.mjs";
import { gitBlobSha } from "./lib/edition-state.mjs";
import { boundCalendarReport } from "./lib/release-calendar-discovery.mjs";
import { deferredCalendarReview, validateCalendarReview } from "./lib/calendar-review.mjs";

it("retains every calendar task and review link across pinned bounded pages", () => {
  const allCandidates = Array.from({ length: 140 }, (_, index) => ({ title: `Game ${index}`, observations: [{ url: `https://store.example/${index}`, description: "x".repeat(300) }] }));
  const reviewLinks = Array.from({ length: 8 }, (_, index) => ({ url: `https://official.example/${index}` }));
  const report = { editionDate: "2026-10-02", window: { startInclusive: "2026-10-03", endInclusive: "2026-10-17" }, candidates: allCandidates.slice(0, 100), allCandidates, reviewLinks, omittedCandidates: 40 };
  const { manifest, pages } = buildCalendarWorkPages(report);
  expect(manifest.totalTasks).toBe(148);
  expect(manifest.unavailableUpstreamTasks).toBe(0);
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.flatMap(page => JSON.parse(page.text).items)).toEqual([...allCandidates.map(candidate => ({ kind: "candidate", candidate })), ...reviewLinks.map(link => ({ kind: "review-link", link }))]);
  pages.forEach(page => { expect(page.text.length).toBeLessThanOrEqual(24000); expect(page.blobSha).toBe(gitBlobSha(page.text)); });
  expect(boundCalendarReport(report)).not.toHaveProperty("allCandidates");
  const review = deferredCalendarReview(manifest, "Official product page temporarily inaccessible");
  expect(validateCalendarReview(manifest, review)).toEqual([]);
  expect(validateCalendarReview(manifest, undefined)).toHaveLength(2);
  review.pages[0].key = "not-the-acknowledged-page";
  expect(validateCalendarReview(manifest, review)).toHaveLength(1);
  review.platforms.pop();
  expect(validateCalendarReview(manifest, review)).toHaveLength(2);
});

it("keeps historical upstream loss explicit and refuses to truncate an oversized task", () => {
  expect(buildCalendarWorkPages({ candidates: [], omittedCandidates: 47 }).manifest.unavailableUpstreamTasks).toBe(47);
  expect(() => buildCalendarWorkPages({ candidates: [{ title: "x".repeat(25000) }] })).toThrow(/no work was silently dropped/);
});
