import { describe, expect, it } from "vitest";
import { candidateLimitTelemetry, DEFAULT_EVIDENCE_CANDIDATE_LIMIT } from "./build-evidence.mjs";
import { buildEditorialInput, validateEnglishEditorialLocale } from "./lib/editorial-contract.mjs";
import { createEditionState, validateEditionState } from "./lib/edition-state.mjs";
import { buildEdition } from "./lib/edition-publisher.mjs";
import { editionWindowForDate } from "./lib/edition-window.mjs";
import { resolveDueEdition } from "./resolve-due-edition.mjs";
import { resolvePacketDispatchTarget } from "./resolve-packet-dispatch.mjs";

function evidencePackages(count) {
  return Array.from({ length: count }, (_, index) => ({
    eventKey: `event-${String(index).padStart(3, "0")}`,
    eventKind: "announcement",
    subjectKey: `game-${index}`,
    headline: `Game ${index} announced`,
    tier: index % 7 === 0 ? "A" : "B",
    score: index % 7 === 0 ? 140 : 90,
    timeRelation: "window",
    readiness: "primary-plus-independent",
    sources: [{
      sourceIndex: 0,
      status: "opened",
      kind: "primary",
      independenceKey: `publisher-${index}`,
      label: `Publisher ${index}`,
      url: `https://publisher${index}.example/news`,
      canonicalUrl: `https://publisher${index}.example/news`,
      evidenceText: `Publisher ${index} announced Game ${index}. This compact evidence fixture is deliberately short.`,
    }],
  }));
}

const dailyWindow = editionWindowForDate("2026-09-01", "daily");

function dailyPublisherFixture() {
  return {
    packet: {
      editorialInput: {
        window: dailyWindow,
        packages: [{
          eventKey: "event-1",
          tier: "A",
          sources: [{
            sourceIndex: 0,
            status: "opened",
            kind: "primary",
            label: "Publisher",
            url: "https://publisher.example/news",
          }],
        }],
      },
    },
    editorial: {
      editionId: dailyWindow.id,
      archiveTitle: "日报｜《Example Game》公布新消息",
      leadEventKey: "event-1",
      decisions: [{
        eventKey: "event-1",
        decision: "include",
        section: "news",
        titleKey: "example-game",
        titleZhCn: null,
        titleEn: "Example Game",
        titleZhStatus: "unavailable",
        headline: "《Example Game》公布新消息",
        summary: "开发商公布了可由一手来源确认的新消息。",
        factStatus: "official",
        timeStatus: "date_only",
        entryFlags: [],
        tracking: false,
        verification: "已打开开发商公告。",
        reason: "一手来源确认。",
        beijingTime: null,
        timeNote: "证据支持该 Daily 固定窗口。",
        platforms: ["PC"],
        region: "全球",
        releaseType: "新作公布",
        sourceIndexes: [0],
        additionalSources: [],
      }],
      upcomingMode: "replace",
      removeUpcomingIds: [],
      upcoming: [],
      checkedExtra: [],
      limitedExtra: [],
      editorialNote: "Daily precutover fixture.",
    },
    latest: {
      id: "2026-08-31-pm",
      upcoming: [],
      entries: [{
        id: "2026-08-31-pm-news-0",
        title: { title_key: "other-game", title_en: "Other Game", title_zh_status: "unavailable" },
        headline: "Other Game update",
      }],
    },
    manifest: {
      schemaVersion: 1,
      updatedAt: "2026-08-31 17:05",
      latest: "2026-08-31-pm",
      editions: [{
        id: "2026-08-31-pm",
        issueNumber: 20,
        date: "2026-08-31",
        period: "pm",
      }],
    },
  };
}

describe("Daily Edition precutover compatibility", () => {
  it("creates a Daily durable state without a new state schema", () => {
    const state = createEditionState("2026-09-01-daily", "2026-09-01T09:00:01.000Z");
    expect(state.schemaVersion).toBe(1);
    expect(state.period).toBe("daily");
    expect(state.plannedAt).toBe("2026-09-01 17:00");
    expect(state.fixedWindow).toEqual({
      startExclusive: "2026-08-31 17:00",
      endInclusive: "2026-09-01 17:00",
    });
    expect(validateEditionState(state)).toEqual([]);
  });

  it("resolves the first Daily after the last published PM without a same-day Daily", () => {
    const manifest = {
      editions: [{ id: "2026-08-31-pm", issueNumber: 20, date: "2026-08-31", period: "pm" }],
    };
    const result = resolveDueEdition({
      period: "daily",
      now: new Date("2026-09-01T09:10:00.000Z"),
      manifest,
      states: {},
      purpose: "packet",
    });
    expect(result.needed).toBe(true);
    expect(result.window.id).toBe("2026-09-01-daily");
    expect(result.window.windowStart).toBe("2026-08-31 17:00");
  });

  it("resolves rollback from a published Daily to the next AM boundary", () => {
    const manifest = {
      editions: [{ id: "2026-09-01-daily", issueNumber: 21, date: "2026-09-01", period: "daily" }],
    };
    const result = resolveDueEdition({
      period: "am",
      now: new Date("2026-09-02T02:10:00.000Z"),
      manifest,
      states: {},
      purpose: "packet",
    });
    expect(result.needed).toBe(true);
    expect(result.window).toMatchObject({
      id: "2026-09-02-am",
      windowStart: "2026-09-01 17:00",
      windowEnd: "2026-09-02 10:10",
    });
  });

  it("supports exact manual Daily recovery while keeping the fixed cutoff", () => {
    const target = resolvePacketDispatchTarget({
      period: "daily",
      edition: "2026-09-01-daily",
      now: new Date("2026-09-01T10:30:00.000Z"),
    });
    expect(target.explicit).toBe(true);
    expect(target.window).toEqual(dailyWindow);
    expect(target.referenceNow).toBe("2026-09-01T09:00:00.000Z");
  });

  it("publishes Daily as schema v2, continues issue numbers, and replaces upcoming", () => {
    const fixture = dailyPublisherFixture();
    const result = buildEdition({ ...fixture, now: new Date("2026-09-01T09:12:00.000Z") });
    expect(result.status).toBe("built");
    expect(result.edition).toMatchObject({
      id: "2026-09-01-daily",
      issueNumber: 21,
      period: "daily",
      schemaVersion: 2,
      plannedAt: "2026-09-01 17:00",
      windowStart: "2026-08-31 17:00",
      windowEnd: "2026-09-01 17:00",
      nextEditionAt: "2026-09-02 17:00",
    });
    expect(result.edition.archiveTitle.startsWith("日报｜")).toBe(true);
    expect(result.archivePath).toBe("archive/2026/09/2026-09-01-daily.json");
    expect(result.manifest.editions.at(-1).issueNumber).toBe(21);
  });

  it("rejects Daily inherit-and-patch upcoming semantics", () => {
    const fixture = dailyPublisherFixture();
    fixture.editorial.upcomingMode = "inherit_and_patch";
    expect(() => buildEdition(fixture)).toThrow("Daily editions require upcomingMode=replace");
  });

  it("accepts the Daily English archive prefix", () => {
    expect(validateEnglishEditorialLocale({
      contractVersion: 2,
      editionId: "2026-09-01-daily",
      decisions: [],
      upcoming: [],
      locales: {
        en: {
          schemaVersion: 1,
          locale: "en",
          archiveTitle: "Daily Brief | Example Game update",
          entries: [],
          upcoming: [],
          sourceReport: null,
        },
      },
    })).toEqual([]);
  });

  for (const count of [10, 20, 40, 80]) {
    it(`keeps the 120k packet budget observable with ${count} evidence packages`, () => {
      const input = buildEditorialInput({
        window: dailyWindow,
        adjacentEdition: "2026-08-31-pm",
        packages: evidencePackages(count),
      }, 120_000);
      expect(input.budget.maxInputChars).toBe(120_000);
      expect(input.budget.candidateItems).toBe(count);
      expect(input.budget.activeTrackingItems).toBe(0);
      expect(input.budget.includedItems + input.budget.omittedItems).toBe(count);
      if (input.budget.omittedTierA > 0) {
        expect(input.budget.omittedTierAEventKeys.length).toBe(input.budget.omittedTierA);
      }
    });
  }

  for (const count of [10, 20, 40, 80]) {
    it(`reports the unchanged evidence cap for a ${count}-candidate review queue`, () => {
      const queue = evidencePackages(count);
      const telemetry = candidateLimitTelemetry(queue, DEFAULT_EVIDENCE_CANDIDATE_LIMIT);
      expect(telemetry.reviewQueueCandidates).toBe(count);
      expect(telemetry.selectedCandidates).toBe(Math.min(count, 30));
      expect(telemetry.omittedByCandidateLimit).toBe(Math.max(0, count - 30));
      if (count > 30) {
        expect(telemetry.omittedTierA + telemetry.omittedTierB).toBe(count - 30);
      }
    });
  }
});
