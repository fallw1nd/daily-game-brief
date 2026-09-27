import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadReplayFixture, replayCalendarBaseline, replayFixture } from "./lib/release-calendar-replay.mjs";

const fixtureRoot = resolve("scripts/fixtures/release-calendar");

afterEach(() => vi.unstubAllGlobals());

describe("historical release-calendar replay baseline", () => {
  it("replays the 2026-09-18 natural wake artifact with immutable omission accounting", async () => {
    const result = await replayFixture("daily18", fixtureRoot);
    expect(result.omissionAccounting).toMatchObject({
      reportAvailableRows: 82,
      capBeforeGroups: 82,
      capOmittedRows: 0,
      packetRows: 44,
      budgetOmittedRows: 38,
      reconciles: true,
      capOmissionRecovery: "unknown",
    });
    expect(result.packet.nameDiagnostics.leadCount).toBe(30);
    expect(result.packet.kindCoverage).toMatchObject({ primary: { rows: 30 }, discovery: { rows: 14 } });
    expect(result.proposed).toMatchObject({
      visibleRawRows: 82,
      uniqueTasks: 65,
      dedupeReduction: 17,
      packetTasks: 65,
      visibleTasksNotPacket: 0,
      budgetOmittedTasks: 0,
      overBudget: false,
    });
    expect(result.proposed.calendarChars).toBeLessThanOrEqual(24000);
    expect(result.sourceDiagnostics.source).toEqual({ known: 0, unknown: 6, failed: null });
    expect(result.sourceDiagnostics.parser).toEqual({ known: 0, unknown: 6, failed: null });
    expect(result.sourceDiagnostics.reportedInWindowRows).toBe(82);
    expect(result.report.platformCoverage.byFamily).toEqual({ PC: 51, PlayStation: 14, Xbox: 11, Nintendo: 21 });
    expect(result.provenance.productionMainSha).toBe("1b7ff947e94ccda1c0610917919e9cf44f416e3a");
    expect(result.provenance.auditBaseSha).toBe("15bb0100277fd4f9b5e0ef67e56fdba2ed2f81e7");
  });

  it("replays the 2026-09-19 artifact without counting report cap omissions twice", async () => {
    const result = await replayFixture("daily19", fixtureRoot);
    expect(result.omissionAccounting).toMatchObject({
      reportAvailableRows: 100,
      capBeforeGroups: 201,
      capOmittedRows: 101,
      packetRows: 43,
      packetOmittedTotal: 158,
      budgetOmittedRows: 57,
      reconciles: true,
      capOmissionRecovery: "unknown",
    });
    expect(result.packet.nameDiagnostics.leadCount).toBe(24);
    expect(result.packet.kindCoverage).toMatchObject({ primary: { rows: 32 }, discovery: { rows: 11 } });
    expect(result.proposed).toMatchObject({
      visibleRawRows: 100,
      uniqueTasks: 76,
      dedupeReduction: 24,
      packetTasks: 76,
      visibleTasksNotPacket: 0,
      budgetOmittedTasks: 0,
      reportStageOmittedCandidates: 101,
      reportStageOmittedUnit: "unknown_rows_or_groups",
      overBudget: false,
    });
    expect(result.proposed.calendarChars).toBeLessThanOrEqual(24000);
    expect(result.omissionAccounting.capOmittedUnit).toBe("unknown_rows_or_groups");
    expect(result.sourceDiagnostics.source).toEqual({ known: 0, unknown: 6, failed: null });
    expect(result.sourceDiagnostics.parser).toEqual({ known: 0, unknown: 6, failed: null });
    expect(result.sourceDiagnostics.reportedInWindowRows).toBe(253);
    expect(result.report.platformCoverage.byFamily).toEqual({ PC: 38, PlayStation: 14, Xbox: 38, Nintendo: 21 });
    expect(result.provenance.productionMainSha).toBe("df6791cfb4d0486329ae38064b9b1ba5b2cc45bf");
    expect(result.provenance.auditBaseSha).toBe("15bb0100277fd4f9b5e0ef67e56fdba2ed2f81e7");
  });

  it("counts a repeated lead once per platform and family while retaining original labels", async () => {
    const fixture = await loadReplayFixture("daily18", fixtureRoot);
    const result = replayCalendarBaseline(fixture);
    expect(result.packet.platformCoverage.byPlatform.PC).toBe(20);
    expect(result.packet.platformCoverage.byPlatform["PS5"]).toBe(10);
    expect(result.packet.platformCoverage.byFamily).toEqual({ PC: 20, PlayStation: 10, Xbox: 8, Nintendo: 15 });
    expect(result.packet.nameDiagnostics.duplicateExtraRows).toBeGreaterThan(0);
    expect(result.packet.nameDiagnostics.leadCount).toBe(30);
  });

  it("treats missing phase fields as unknown rather than successful", async () => {
    const fixture = await loadReplayFixture("daily18", fixtureRoot);
    const result = replayCalendarBaseline(fixture);
    expect(result.sourceDiagnostics.coverage.every((entry) => entry.sourceStatus === null && entry.parserStatus === null)).toBe(true);
    expect(result.sourceDiagnostics.source.known).toBe(0);
    expect(result.sourceDiagnostics.parser.known).toBe(0);
    expect(result.sourceDiagnostics.source.failed).toBeNull();
    expect(result.sourceDiagnostics.parser.failed).toBeNull();
  });

  it("can rerun metrics with a new lead key without changing any fixture input", async () => {
    const paths = ["report.json", "packet-calendar.json", "provenance.json"].map((file) => resolve(fixtureRoot, "daily19", file));
    const before = await Promise.all(paths.map((path) => readFile(path, "utf8")));
    const fixture = await loadReplayFixture("daily19", fixtureRoot);
    const result = replayCalendarBaseline(fixture, { leadKey: (candidate) => candidate.productId || candidate.title });
    const after = await Promise.all(paths.map((path) => readFile(path, "utf8")));
    expect(result.packet.nameDiagnostics.leadCount).toBeGreaterThan(24);
    expect(after).toEqual(before);
  });

  it("never invokes fetch and restores the stubbed global", async () => {
    const originalFetch = globalThis.fetch;
    const fetch = vi.fn(() => { throw new Error("network access is forbidden in replay"); });
    vi.stubGlobal("fetch", fetch);
    await replayFixture("daily18", fixtureRoot);
    await replayFixture("daily19", fixtureRoot);
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
