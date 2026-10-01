import { describe, expect, it } from "vitest";
import { expandSecondaryEditorial } from "./expand-secondary-editorial.mjs";
import { applySecondaryTitlePatch } from "./apply-secondary-title-patch.mjs";

function decision(eventKey) {
  return {
    eventKey,
    decision: "exclude",
    section: null,
    titleKey: null,
    titleZhCn: null,
    titleEn: null,
    titleZhStatus: null,
    headline: null,
    summary: null,
    factStatus: null,
    timeStatus: null,
    entryFlags: [],
    tracking: false,
    verification: "",
    reason: "not selected",
    beijingTime: null,
    timeNote: null,
    platforms: [],
    region: null,
    releaseType: null,
    sourceIndexes: [],
    additionalSources: [],
  };
}

const packet = {
  finalizedAt: "2026-09-27T10:00:00.000Z",
  editorialInput: {
    window: { id: "2026-09-26-daily" },
    packages: [
      { eventKey: "fresh", publishability: "direct" },
      { eventKey: "blocked", publishability: "requires_subject_identity" },
    ],
    trackingQueue: [
      { eventKey: "stale", lastSeenAt: "2026-09-23T09:00:00.000Z" },
      { eventKey: "recent", lastSeenAt: "2026-09-26T12:00:00.000Z" },
    ],
  },
};

function request(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "edition",
    packetBlobSha: "a".repeat(40),
    editionId: "2026-09-26-daily",
    archiveTitle: "日报｜测试二次发布",
    leadEventKey: "fresh",
    decisions: [decision("fresh")],
    excludePackageKeys: ["blocked"],
    upcomingMode: "inherit_and_patch",
    removeUpcomingIds: [],
    upcoming: [],
    checkedExtra: [],
    limitedExtra: [],
    editorialNote: "test",
    trackingPolicy: "close_stale",
    staleTrackingHours: 72,
    recoverFailedPublication: false,
    ...overrides,
  };
}

describe("secondary publication", () => {
  it("expands bounded package exclusions plus tracking reminders deterministically", () => {
    const result = expandSecondaryEditorial(request(), packet);
    expect(result.contractVersion).toBe(2);
    expect(result.decisions).toHaveLength(4);
    expect(result.decisions[0]).toMatchObject({ eventKey: "fresh", reason: "not selected" });
    expect(result.decisions[1]).toMatchObject({ eventKey: "blocked", decision: "exclude", tracking: false });
    expect(result.decisions[1].reason).toMatch(/requires_subject_identity/);
    expect(result.decisions[2]).toMatchObject({ eventKey: "stale", decision: "exclude", tracking: false });
    expect(result.decisions[3]).toMatchObject({ eventKey: "recent", decision: "needs_review", tracking: true });
    expect(result).not.toHaveProperty("excludePackageKeys");
    expect(result).not.toHaveProperty("trackingPolicy");
    expect(result).not.toHaveProperty("recoverFailedPublication");
    expect(expandSecondaryEditorial(request({ historicalInsertion: { issueNumber: 51, latestEditionId: "2026-10-01-daily" } }), packet)).not.toHaveProperty("historicalInsertion");
  });

  it("refuses missing, invented, duplicated, or conflicting package identities", () => {
    expect(() => expandSecondaryEditorial(request({ decisions: [], excludePackageKeys: [] }), packet)).toThrow(/missing package decision/);
    expect(() => expandSecondaryEditorial(request({ decisions: [decision("invented")], excludePackageKeys: ["blocked"] }), packet)).toThrow(/non-package decision/);
    expect(() => expandSecondaryEditorial(request({ decisions: [decision("fresh")], excludePackageKeys: ["invented"] }), packet)).toThrow(/non-package exclusion/);
    expect(() => expandSecondaryEditorial(request({ decisions: [decision("fresh")], excludePackageKeys: ["fresh", "blocked"] }), packet)).toThrow(/both authors and excludes/);
  });

  it("adds verified missing translations without overwriting an existing decision", () => {
    const registry = { schemaVersion: 1, updatedAt: "2026-09-24", translations: { known: { titleZhCn: "已知", titleZhStatus: "official_simplified" } } };
    const patch = {
      schemaVersion: 1,
      kind: "title_backfill",
      updatedAt: "2026-09-27",
      translations: {
        new: { titleZhCn: "新译名", titleZhStatus: "official_simplified", evidence: { kind: "official_source", url: "https://example.com" } },
      },
    };
    const result = applySecondaryTitlePatch(registry, patch);
    expect(result.added).toBe(1);
    expect(result.registry.translations.new.titleZhCn).toBe("新译名");
    expect(result.registry.translations.known.titleZhCn).toBe("已知");
  });

  it("rejects a conflicting registry overwrite", () => {
    const registry = { schemaVersion: 1, translations: { known: { titleZhCn: "已知", titleZhStatus: "official_simplified" } } };
    const patch = { schemaVersion: 1, kind: "title_backfill", translations: { known: { titleZhCn: "冲突", titleZhStatus: "common_translation", evidence: { kind: "common_usage" } } } };
    expect(() => applySecondaryTitlePatch(registry, patch)).toThrow(/conflicts with existing registry entry/);
  });
});
