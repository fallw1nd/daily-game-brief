// @vitest-environment node
import { pathToFileURL } from "node:url";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { expectedEditorialWindow, validateFinalizedEditorialPacket } from "./lib/editorial-packet.mjs";
import { gitBlobSha } from "./lib/edition-state.mjs";
const exec = promisify(execFile);

describe("calendar packet integration", () => {
  it("runs the real handoff builder with a failed discovery network without breaking news or inventing releases", async () => {
    const root = await mkdtemp(join(tmpdir(), "calendar-packet-"));
    const evidencePath = join(root, "evidence.json");
    const packetPath = join(root, "packet.json");
    const reportPath = join(root, "report.json");
    const healthPath = join(root, "health.json");
    const preload = join(root, "offline.mjs");
    await writeFile(evidencePath, JSON.stringify({ window: expectedEditorialWindow("2026-09-08-daily"), packages: [] }));
    await writeFile(preload, 'globalThis.fetch = async () => { throw new Error("test outage"); };');
    await exec(process.execPath, ["--import", pathToFileURL(preload).href, "scripts/editorialize.mjs"], {
      cwd: resolve("."), env: {
        ...process.env, NEWS_EVIDENCE_PATH: evidencePath, EDITORIAL_PACKET_PATH: packetPath,
        RELEASE_CALENDAR_REPORT_PATH: reportPath, RELEASE_CALENDAR_HEALTH_PATH: healthPath,
        RELEASE_CALENDAR_HEALTH_PREVIOUS_PATH: join(root, "absent-health.json"),
        EVENT_LEDGER_PATH: join(root, "absent.json"), TITLE_HINTS_PATH: join(root, "absent-hints.json"),
      },
    });
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    const health = JSON.parse(await readFile(healthPath, "utf8"));
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    expect(validateFinalizedEditorialPacket(packet, { editionId: "2026-09-08-daily", period: "daily" })).toEqual([]);
    expect(packet.editorialInput.upcomingDiscovery.coverage.every(s => s.status === "failed")).toBe(true);
    expect(report.coverage.every(s => s.sourceStatus === "failed" && s.parserStatus === "unknown")).toBe(true);
    expect(Object.values(health.sources).every(s => s.lastFetchStatus === "failed" && s.lastParserStatus === "unknown")).toBe(true);
    expect(packet.editorialInput.upcomingDiscovery.candidates).toEqual([]);
    expect(packet.editorialInput.packages).toEqual([]);
    expect(packet.editorialInput.upcomingBaseline.refreshRange).toEqual({ startInclusive: "2026-09-09", endInclusive: "2026-09-23" });
    expect(packet.editorialInput.budget.usedInputChars).toBeLessThanOrEqual(packet.editorialInput.budget.maxInputChars);
  }, 20000);

  it("reuses the report without fetching or recording another health observation", async () => {
    const root = await mkdtemp(join(tmpdir(), "calendar-reuse-"));
    const evidencePath = join(root, "evidence.json");
    const packetPath = join(root, "packet.json");
    const reportPath = join(root, "report.json");
    const healthPath = join(root, "health.json");
    const preload = join(root, "offline.mjs");
    await writeFile(evidencePath, JSON.stringify({ window: expectedEditorialWindow("2026-09-08-daily"), packages: [] }));
    await writeFile(preload, 'globalThis.fetch = async () => { throw new Error("reuse must not fetch"); };');
    const env = {
      ...process.env, NEWS_EVIDENCE_PATH: evidencePath, EDITORIAL_PACKET_PATH: packetPath,
      RELEASE_CALENDAR_REPORT_PATH: reportPath, RELEASE_CALENDAR_HEALTH_PATH: healthPath,
      RELEASE_CALENDAR_HEALTH_PREVIOUS_PATH: join(root, "absent-health.json"), REUSE_RELEASE_CALENDAR_REPORT: "true",
      EVENT_LEDGER_PATH: join(root, "absent.json"), TITLE_HINTS_PATH: join(root, "absent-hints.json"),
    };
    const existingReport = {
      editionDate: "2026-09-08", fetchedAt: "2026-09-08T04:00:00.000Z", window: { startInclusive: "2026-09-09", endInclusive: "2026-09-23" },
      coverage: [{ sourceId: "cached", status: "failed", sourceStatus: "failed", parserStatus: "unknown", pages: 0, pagesAttempted: 1, pagesSucceeded: 0, pagesFailed: 1, parsedCount: 0, inWindow: 0, usefulLeads: 0, durationMs: 1 }],
      candidates: [], allCandidates: [{ title: "Game beyond inline preview", observations: [{ url: "https://official.example/game", date: "2026-09-10", platforms: ["PC"] }] }], reviewLinks: [], omittedCandidates: 1,
    };
    await writeFile(reportPath, JSON.stringify(existingReport));
    await exec(process.execPath, ["--import", pathToFileURL(preload).href, "scripts/editorialize.mjs"], { cwd: resolve("."), env });
    await writeFile(healthPath, JSON.stringify({ sentinel: true }));
    await exec(process.execPath, ["--import", pathToFileURL(preload).href, "scripts/editorialize.mjs"], { cwd: resolve("."), env });
    expect(JSON.parse(await readFile(healthPath, "utf8"))).toEqual({ sentinel: true });
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    const page = packet.editorialInput.calendarWork.pages[0];
    const pageText = await readFile(join(root, "editorial-batches", page.name), "utf8");
    expect(gitBlobSha(pageText)).toBe(page.blobSha);
    expect(JSON.parse(pageText).items[0].candidate.title).toBe("Game beyond inline preview");
    expect(packet.editorialInput.calendarWork.totalTasks).toBe(1);
  }, 20000);

  it("loads the previous calendar ledger on editorialize's direct discovery path", async () => {
    const root = await mkdtemp(join(tmpdir(), "calendar-packet-health-strategy-"));
    const evidencePath = join(root, "evidence.json");
    const packetPath = join(root, "packet.json");
    const reportPath = join(root, "report.json");
    const healthPath = join(root, "health.json");
    const previousPath = join(root, "previous.json");
    const preload = join(root, "feeds.mjs");
    const recent = [1, 2, 3].map(() => ({
      editionDate: "2026-09-19", fetchedAt: "2026-09-19T04:00:00.000Z", sourceId: "playstation-ps5-rss",
      platform: "PlayStation", family: "playstation", fetchStatus: "failed", parserStatus: "failed",
      pages: { attempted: 1, succeeded: 0, failed: 1 }, parsedCount: 0, inWindowCandidates: 0,
      usefulLeads: 0, outcome: "failed", empty: null, changed: null, partialFailure: false, durationMs: 5,
    }));
    await writeFile(evidencePath, JSON.stringify({ window: expectedEditorialWindow("2026-09-20-daily"), packages: [] }));
    await writeFile(previousPath, JSON.stringify({ schemaVersion: 1, updatedAt: "2026-09-19T04:00:00.000Z", sources: {
      "playstation-ps5-rss": { sourceId: "playstation-ps5-rss", lastObservedAt: "2026-09-19T04:00:00.000Z", recent },
    } }));
    await writeFile(preload, 'globalThis.fetch = async url => new Response(String(url).includes("news.xbox.com") ? "<rss><channel></channel></rss>" : "<html></html>");');
    await exec(process.execPath, ["--import", pathToFileURL(preload).href, "scripts/editorialize.mjs"], {
      cwd: resolve("."), env: {
        ...process.env, NEWS_EVIDENCE_PATH: evidencePath, EDITORIAL_PACKET_PATH: packetPath,
        RELEASE_CALENDAR_REPORT_PATH: reportPath, RELEASE_CALENDAR_HEALTH_PATH: healthPath,
        RELEASE_CALENDAR_HEALTH_PREVIOUS_PATH: previousPath,
        EVENT_LEDGER_PATH: join(root, "absent.json"), TITLE_HINTS_PATH: join(root, "absent-hints.json"),
      },
    });
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const ledger = JSON.parse(await readFile(healthPath, "utf8"));
    expect(report.fallbackTelemetry.fallbackDecisions.find(item => item.sourceId === "playstation-ps5-rss")).toMatchObject({ attempted: false, reason: "degraded_history_low_frequency_skip" });
    expect(report.fallbackTelemetry.actualFallbackAttempts).toEqual(["xbox-official-rss"]);
    expect(ledger.sources["xbox-official-rss"].recent).toHaveLength(1);
  }, 20000);
});
