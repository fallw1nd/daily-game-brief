import { describe, expect, it } from "vitest";
import { mergeNewsSourceReport, mergeEnglishNewsSourceReport } from "./lib/continuation-source-report.mjs";

describe("same-edition news source report", () => {
  it("carries checks and limitations while replacing decided exclusions and the obsolete budget", () => {
    const previous = {
      checked: ["registry", "Nintendo"], checkedGroups: ["official"],
      limited: ["Primary body unavailable", "本编辑包还有 6 个候选待编辑核验；不代表已完成收录。"],
      limitedSources: ["Publisher blocked"],
      trackingResults: ["Old tracking text"],
      excludedMajorCandidates: ["keep：Identity blocked", "include-now：Incomplete", "recheck：Old reason", "already-published：Old conflict"],
      note: "Initial review.", auditStats: { eventLedgerCandidates: 24 }, editorialDecisionDigest: "old",
    };
    const current = {
      checked: ["registry", "IGN"], checkedGroups: ["official", "media"],
      limited: ["Primary body unavailable", "本编辑包还有 2 个候选待编辑核验；不代表已完成收录。"],
      limitedSources: [], trackingResults: [], excludedMajorCandidates: ["recheck：New reason", "new：Out of scope"],
      note: "Continuation review.", auditStats: { eventLedgerCandidates: 6 }, editorialDecisionDigest: "new", calendarReview: { pages: [] },
    };
    const decisions = [{ eventKey: "include-now", decision: "include" }, { eventKey: "recheck", decision: "exclude" }, { eventKey: "new", decision: "exclude" }];
    const entries = [{ eventKey: "include-now", headline: "New story", tracking: false }, { eventKey: "already-published", headline: "Retained rumor", tracking: true }];
    const before = structuredClone({ previous, current, decisions, entries });
    const merged = mergeNewsSourceReport(previous, current, { decisions, entries });
    expect(merged.checked).toEqual(["registry", "Nintendo", "IGN"]);
    expect(merged.checkedGroups).toEqual(["official", "media"]);
    expect(merged.limited).toEqual(current.limited);
    expect(merged.limitedSources).toEqual(previous.limitedSources);
    expect(merged.excludedMajorCandidates).toEqual(["keep：Identity blocked", "recheck：New reason", "new：Out of scope"]);
    expect(merged.trackingResults).toEqual(["Retained rumor：继续追踪。"]);
    expect(merged.auditStats).toEqual(current.auditStats);
    expect(merged.editorialDecisionDigest).toBe("new");
    expect(merged.calendarReview).toEqual(current.calendarReview);
    expect(merged.note).toContain(previous.note);
    expect(merged.note).toContain(current.note);
    expect(mergeNewsSourceReport(merged, current, { decisions, entries })).toEqual(merged);
    expect({ previous, current, decisions, entries }).toEqual(before);
  });

  it("retains optional English reports, deduplicates checks, and never mutates either report", () => {
    const previous = { checked: ["Nintendo", "Steam"], limited: ["Body text limited"], note: "Initial review." };
    const current = { checked: ["Steam", "IGN"], limited: ["Body text limited", "Survey methodology limited"], note: "Continuation review." };
    const merged = mergeEnglishNewsSourceReport(previous, current);
    expect(merged.checked).toEqual(["Nintendo", "Steam", "IGN"]);
    expect(merged.limited).toEqual(["Body text limited", "Survey methodology limited"]);
    expect(merged.note).toBe("Earlier review history (past batch counts, not current pending work):\nInitial review.\n\nCurrent news continuation:\nContinuation review.");
    expect(mergeEnglishNewsSourceReport(merged, current)).toEqual(merged);
    expect(mergeEnglishNewsSourceReport(previous, null)).toEqual(previous);
    expect(mergeEnglishNewsSourceReport(null, current)).toEqual(current);
  });
});
