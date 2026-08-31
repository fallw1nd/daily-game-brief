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
  it("matches an edition entry by normalized source URL", () => {
    const audit = auditCoverage({ window: { id: "2026-08-26-pm" }, packages: [baseItem] }, {
      id: "2026-08-26-pm",
      entries: [{ headline: "中文标题", title: {}, sources: [{ url: "https://publisher.example/crimson-desert" }] }],
    });
    expect(audit.totals.covered).toBe(1);
    expect(audit.omissions).toEqual([]);
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
