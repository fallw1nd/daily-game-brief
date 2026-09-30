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
      packetTasks: 37,
      visibleTasksNotPacket: 28,
      omittedCandidates: 28,
      calendarChars: 23898,
      budgetOmittedTasks: 28,
      overBudget: false,
    });
    expect(result.proposed.calendarChars).toBeLessThanOrEqual(24000);
    expect(result.proposed).toMatchObject({ roundTripVerified: true, restoredTasks: 37, omittedCandidates: 28 });
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
      packetTasks: 33,
      visibleTasksNotPacket: 43,
      budgetOmittedTasks: 43,
      omittedCandidates: 144,
      reportStageOmittedCandidates: 101,
      reportStageOmittedUnit: "unknown_rows_or_groups",
      calendarChars: 23974,
      overBudget: false,
    });
    expect(result.proposed.calendarChars).toBeLessThanOrEqual(24000);
    expect(result.proposed).toMatchObject({ roundTripVerified: true, restoredTasks: 33, omittedCandidates: 144 });
    expect(result.packet.roundTripVerified).toBeNull();
    expect(result.omissionAccounting.capOmittedUnit).toBe("unknown_rows_or_groups");
    expect(result.sourceDiagnostics.source).toEqual({ known: 0, unknown: 6, failed: null });
    expect(result.sourceDiagnostics.parser).toEqual({ known: 0, unknown: 6, failed: null });
    expect(result.sourceDiagnostics.reportedInWindowRows).toBe(253);
    expect(result.report.platformCoverage.byFamily).toEqual({ PC: 38, PlayStation: 14, Xbox: 38, Nintendo: 21 });
    expect(result.provenance.productionMainSha).toBe("df6791cfb4d0486329ae38064b9b1ba5b2cc45bf");
    expect(result.provenance.auditBaseSha).toBe("15bb0100277fd4f9b5e0ef67e56fdba2ed2f81e7");
  });

  it("replays the 2026-09-21 fixture and round-trips all available fields", async () => {
    const result = await replayFixture("daily21", fixtureRoot);
    expect(result.omissionAccounting).toMatchObject({
      reportAvailableRows: 100,
      capBeforeGroups: 136,
      capOmittedRows: 36,
      packetRows: 43,
      packetOmittedTotal: 93,
      budgetOmittedRows: 57,
      reconciles: true,
      capOmissionRecovery: "unknown",
    });
    expect(result.proposed).toMatchObject({ roundTripVerified: true, restoredTasks: 33, omittedCandidates: 77, platformFinalTaskCounts: { PC: 22, PlayStation: 14, Xbox: 18, Nintendo: 15 } });
    expect(result.proposed.calendarChars).toBe(23997);
    expect(result.proposed.calendarChars).toBeLessThanOrEqual(24000);
  });

  it("reads daily30 aggregate reports once and decodes compact packet observations before measuring platforms", async () => {
    const result = await replayFixture("daily30", fixtureRoot);
    expect(result.omissionAccounting).toMatchObject({
      reportAvailableRows: 75,
      reportObservationRows: 104,
      reportUniqueTasks: 75,
      reportDedupeReduction: 29,
      reportTelemetry: { visibleRawRows: 104, uniqueTasks: 75, dedupeReduction: 29 },
      capOmittedRows: 0,
      packetRows: 28,
      packetOmittedTotal: 47,
      budgetOmittedRows: 47,
      reconciles: true,
    });
    expect(result.packet).toMatchObject({
      rows: 28,
      observationRows: 50,
      roundTripVerified: true,
      packetJsonChars: 23956,
      platformCoverage: { byFamily: { PC: 21, PlayStation: 14, Xbox: 20, Nintendo: 11 } },
    });
    expect(result.proposed).toMatchObject({
      visibleRawRows: 104,
      uniqueTasks: 75,
      dedupeReduction: 29,
      duplicateRatio: 0.2788,
      packetTasks: 28,
      capOmittedTasks: 0,
      budgetOmittedTasks: 47,
      omittedCandidates: 47,
      linkOmitted: 8,
      platformFinalTaskCounts: { PC: 21, PlayStation: 14, Xbox: 20, Nintendo: 11 },
      calendarChars: 23956,
      roundTripVerified: true,
      restoredTasks: 28,
      selectedObservationCount: 50,
    });
    expect(result.provenance).toMatchObject({
      runId: "36689493814",
      artifactId: "11085510421",
      packetBlobSha: "2fd27f6be2cdbe8f1b6d5c4af888e039652acdb9",
      sourceArchiveSha256: "616dbe6b7d917d2e7cd26218ac0d1abbe1fcac77ca829bc25fc0a571d6e83202",
    });
  });

  it("rejects incomplete aggregate rows instead of silently treating them as raw candidates", async () => {
    const fixture = await loadReplayFixture("daily30", fixtureRoot);
    const report = structuredClone(fixture.report);
    delete report.candidates[0].observations;
    expect(() => replayCalendarBaseline({ report, packet: fixture.packet })).toThrow("aggregate report candidates must each contain at least one observation");
  });

  it("keeps absent, null, and empty telemetry values unknown", async () => {
    const fixture = await loadReplayFixture("daily30", fixtureRoot);
    const report = structuredClone(fixture.report);
    report.omissionTelemetry.visibleRawRows = null;
    report.omissionTelemetry.uniqueTasks = "";
    report.omissionTelemetry.dedupeReduction = undefined;
    const result = replayCalendarBaseline({ report, packet: fixture.packet });
    expect(result.omissionAccounting.reportTelemetry).toEqual({ visibleRawRows: null, uniqueTasks: null, dedupeReduction: null });
    expect(result.proposed).toMatchObject({ visibleRawRows: 104, uniqueTasks: 75, dedupeReduction: 29 });
  });

  it("detects compact packet defaults that would drop selected source fields", async () => {
    const fixture = await loadReplayFixture("daily30", fixtureRoot);
    const packet = structuredClone(fixture.packet);
    let removed = false;
    for (const [sourceId, defaults] of Object.entries(packet.observationDefaultsBySource)) {
      for (const field of Object.keys(defaults)) {
        if (["dates", "platforms"].includes(field)) continue;
        const reliesOnDefault = packet.candidates.some((candidate) => candidate.observations.some((observation) => observation.sourceId === sourceId && !Object.hasOwn(observation, field)));
        if (!reliesOnDefault) continue;
        delete defaults[field];
        removed = true;
        break;
      }
      if (removed) break;
    }
    expect(removed).toBe(true);
    expect(() => replayCalendarBaseline({ report: fixture.report, packet })).toThrow("historical calendar packet does not preserve its selected source observations");
  });

  it("counts an explicit family for an unknown device without inventing a platform", () => {
    const observation = {
      sourceId: "nintendo-coming",
      title: "Unannounced Device Title",
      platform: "unknown",
      platforms: ["unknown"],
      platformFamily: "Nintendo",
      date: "2026-10-02",
      dates: ["2026-10-02"],
    };
    const lead = {
      title: observation.title,
      date: observation.date,
      platforms: [],
      platformFamily: "Nintendo",
      identityStatus: "needs_verification",
      identity: { key: "name:unannounceddevicetitle", registryIds: [], conflictProductIds: [] },
      knownTitle: false,
      inBaseline: false,
      crossSource: false,
      observations: [observation],
    };
    const packet = {
      candidates: [{
        title: lead.title,
        date: lead.date,
        dateConflictStatus: "none",
        identityStatus: lead.identityStatus,
        identity: lead.identity,
        knownTitle: false,
        inBaseline: false,
        crossSource: false,
        observations: [{ ...observation }],
      }],
      observationDefaultsBySource: {},
      sharedObservationUrls: [],
      omittedCandidates: 0,
      omissionTelemetry: {},
    };
    const report = { candidates: [lead], omittedCandidates: 0, coverage: [] };
    const result = replayCalendarBaseline({ report, packet });
    expect(result.packet.platformCoverage.byFamily.Nintendo).toBe(1);
    expect(result.packet.platformCoverage.byPlatform.Nintendo).toBe(1);
    expect(result.packet.platformCoverage.byPlatform["Nintendo Switch"]).toBeUndefined();
    expect(result.packet.roundTripVerified).toBe(true);
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
