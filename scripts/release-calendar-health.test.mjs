// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadReplayFixture, replayCalendarBaseline } from "./lib/release-calendar-replay.mjs";
import { MAX_RECENT_OBSERVATIONS, sourceHealthSummary, updateCalendarHealth } from "./lib/release-calendar-health.mjs";

const report = (entry, extra = {}) => ({
  editionDate: "2026-09-20",
  fetchedAt: "2026-09-20T04:00:00.000Z",
  coverage: [{ sourceId: "steam", platform: "PC", ...entry }],
  ...extra,
});

describe("release calendar source health ledger", () => {
  it("is idempotent for the edition/fetchedAt/source identity", () => {
    const current = report({ sourceStatus: "success", parserStatus: "success", pagesAttempted: 2, pagesSucceeded: 2, pagesFailed: 0, inWindow: 3, usefulLeads: 2, durationMs: 120, status: "success" });
    const once = updateCalendarHealth(undefined, current);
    const twice = updateCalendarHealth(once, current);
    expect(twice).toEqual(once);
    expect(twice.sources.steam.recent).toHaveLength(1);
  });

  it("keeps an out-of-order observation in history without regressing last state", () => {
    const latest = report({ sourceStatus: "success", parserStatus: "success", usefulLeads: 4 }, { fetchedAt: "2026-09-20T04:00:00.000Z" });
    const older = report({ sourceStatus: "failed", parserStatus: "unknown", outcome: "failed" }, { editionDate: "2026-09-19", fetchedAt: "2026-09-19T04:00:00.000Z" });
    const ledger = updateCalendarHealth(updateCalendarHealth(undefined, latest), older);
    expect(ledger.sources.steam.lastFetchStatus).toBe("success");
    expect(ledger.sources.steam.lastUsefulLeads).toBe(4);
    expect(ledger.sources.steam.recent.map((item) => item.editionDate)).toEqual(["2026-09-19", "2026-09-20"]);
  });

  it("retains only the most recent 30 observations", () => {
    let ledger;
    for (let day = 0; day < MAX_RECENT_OBSERVATIONS + 5; day++) {
      const editionDate = new Date(Date.UTC(2026, 8, 1 + day)).toISOString().slice(0, 10);
      ledger = updateCalendarHealth(ledger, report({ sourceStatus: "success", parserStatus: "success" }, { editionDate, fetchedAt: `${editionDate}T04:00:00.000Z` }));
    }
    expect(ledger.sources.steam.recent).toHaveLength(MAX_RECENT_OBSERVATIONS);
    expect(ledger.sources.steam.recent[0].editionDate).toBe("2026-09-06");
  });

  it("records independent page phases and partial failures", () => {
    const ledger = updateCalendarHealth(undefined, report({
      sourceStatus: "partial_failure", parserStatus: "success",
      pagesAttempted: 3, pagesSucceeded: 2, pagesFailed: 1,
      inWindow: 1, usefulLeads: 1, partialFailure: true, durationMs: 800,
    }));
    expect(ledger.sources.steam.recent[0]).toMatchObject({
      fetchStatus: "partial_failure", parserStatus: "success",
      pages: { attempted: 3, succeeded: 2, failed: 1 },
      partialFailure: true, inWindowCandidates: 1, usefulLeads: 1, durationMs: 800,
    });
  });

  it("distinguishes HTTP success with an empty or changed parser result", () => {
    const ledger = updateCalendarHealth(undefined, report({
      sourceStatus: "success", parserStatus: "success", status: "empty_or_changed",
      pagesAttempted: 1, pagesSucceeded: 1, pagesFailed: 0, empty: true, changed: true,
    }));
    const observation = ledger.sources.steam.recent[0];
    expect(observation.fetchStatus).toBe("success");
    expect(observation.parserStatus).toBe("success");
    expect(observation.outcome).toBe("empty_or_changed");
    expect(observation.empty).toBe(true);
    expect(observation.changed).toBe(true);
  });

  it("keeps legacy coverage phase fields unknown instead of claiming parser success", async () => {
    const fixture = await loadReplayFixture("daily18", resolve("scripts/fixtures/release-calendar"));
    const replay = replayCalendarBaseline(fixture);
    const ledger = updateCalendarHealth(undefined, fixture.report);
    expect(replay.sourceDiagnostics.parser.unknown).toBe(6);
    expect(Object.values(ledger.sources)).toHaveLength(6);
    expect(Object.values(ledger.sources).every((source) => source.lastFetchStatus === "unknown" && source.lastParserStatus === "unknown")).toBe(true);
  });

  it("rebuilds malformed previous ledgers and leaves a diagnostic", () => {
    const ledger = updateCalendarHealth({ schemaVersion: 1, sources: { steam: { recent: "not-an-array" } } }, report({ sourceStatus: "success", parserStatus: "unknown" }));
    expect(ledger.sources.steam.recent).toHaveLength(1);
    expect(ledger.diagnostics[0].code).toBe("malformed_previous_ledger");
  });

  it("diagnoses a report without a supported source array", () => {
    const ledger = updateCalendarHealth(undefined, { editionDate: "2026-09-20" });
    expect(ledger.sources).toEqual({});
    expect(ledger.diagnostics[0].code).toBe("invalid_report_entries");
  });

  it("skips invalid source entries without throwing and exposes a stable summary", () => {
    const ledger = updateCalendarHealth(undefined, { editionDate: "bad", coverage: [{ platform: "PC" }, { sourceId: "x", platform: "PC", sourceStatus: "success", parserStatus: "unknown" }] });
    expect(Object.keys(ledger.sources)).toEqual(["x"]);
    expect(ledger.diagnostics.some((item) => item.code === "invalid_source_entry")).toBe(true);
    expect(sourceHealthSummary(ledger, { platform: "PC" }).sources[0]).toMatchObject({ sourceId: "x", fetchSuccessesRecent: 1, parserSuccessesRecent: 0 });
  });
});
