import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditCoverage } from "./lib/coverage-audit.mjs";

const baseItem = {
  eventKey: "event-1",
  headline: "Crimson Desert release date announced",
  subjectKey: "crimson desert",
  tier: "A",
  timeRelation: "window",
  readiness: "primary-plus-independent",
  sources: [{
    status: "opened",
    kind: "primary",
    independenceKey: "publisher",
    url: "https://publisher.example/crimson-desert?utm_source=rss",
  }],
};

describe("coverage audit", () => {
  it("requires all showcase facts even when the announcement, subject and URL match", () => {
    const ref = { showcaseId: "direct", announcementId: "game-update" };
    const item = { ...baseItem, showcaseRefs: [ref], showcaseFacts: [{ id: "release" }, { id: "demo" }] };
    const entry = { headline: baseItem.headline, sources: baseItem.sources, showcaseRefs: [{ ...ref, factIds: ["release"] }] };
    const evidence = { packages: [item] };
    expect(auditCoverage(evidence, { entries: [entry] }).totals.covered).toBe(0);
    expect(auditCoverage(evidence, { entries: [entry, { showcaseRefs: [{ ...ref, factIds: ["demo"] }] }] }).totals.covered).toBe(1);
    expect(auditCoverage(evidence, { entries: [entry, { showcaseRefs: [{ ...ref, announcementId: "other", factIds: ["demo"] }] }] }).totals.covered).toBe(0);
  });

  it("matches legacy entries only with exact headline and normalized source URL", () => {
    const audit = auditCoverage({ window: { id: "2026-08-26-pm" }, packages: [baseItem] }, {
      id: "2026-08-26-pm",
      entries: [{ headline: baseItem.headline, title: {}, sources: [{ url: "https://publisher.example/crimson-desert" }] }],
    });
    expect(audit.totals.covered).toBe(1);
    expect(audit.omissions).toEqual([]);
  });

  it("does not confuse two facts about one game, even when they share a source page", () => {
    const entry = { title: { title_en: "Crimson Desert" }, headline: "Crimson Desert studio closes", sources: baseItem.sources };
    expect(auditCoverage({ packages: [baseItem] }, { entries: [entry] }).totals.highConfidenceOmissions).toBe(1);
    expect(auditCoverage({ packages: [baseItem] }, { entries: [{ ...entry, eventKey: "other-event" }] }).totals.covered).toBe(0);
    expect(auditCoverage({ packages: [baseItem] }, { entries: [{ ...entry, eventKey: baseItem.eventKey }] }).totals.covered).toBe(1);
  });

  it("accounts for explicit exclusions only when bound to the committed decision", () => {
    const edition = { entries: [], sourceReport: { editorialDecisionDigest: "current" } };
    const decisions = [{ eventKey: baseItem.eventKey, decision: "exclude", reason: "Duplicate of another scoped event" }];
    expect(auditCoverage({ packages: [baseItem] }, edition, { decisions, decisionDigest: "stale" }).totals.highConfidenceOmissions).toBe(1);
    const result = auditCoverage({ packages: [baseItem] }, edition, { decisions, decisionDigest: "current" });
    expect(result.totals).toMatchObject({ covered: 0, explicitlyExcluded: 1, highConfidenceOmissions: 0 });
  });

  it("flags an unmatched A-level primary event as a high-confidence omission", () => {
    const audit = auditCoverage({ window: { id: "2026-08-26-pm" }, packages: [baseItem] }, {
      id: "2026-08-26-pm",
      entries: [],
    });
    expect(audit.totals.highConfidenceOmissions).toBe(1);
    expect(audit.omissions[0].eventKey).toBe("event-1");
  });

  it("does not call an out-of-window candidate an omission", () => {
    const audit = auditCoverage({
      window: { id: "2026-08-26-pm" },
      packages: [{ ...baseItem, timeRelation: "prior-24h-audit" }],
    }, { id: "2026-08-26-pm", entries: [] });
    expect(audit.omissions).toEqual([]);
  });

  it("keeps the coverage audit CLI compatible with Daily edition IDs", () => {
    const script = readFileSync("scripts/audit-news-coverage.mjs", "utf8");
    expect(script).toContain("(?:am|pm|daily)");
  });
});
