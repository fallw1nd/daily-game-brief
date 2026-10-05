// @vitest-environment node
import { pathToFileURL } from "node:url";
import { mkdtemp, writeFile, readFile, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { expectedEditorialWindow, validateFinalizedEditorialPacket } from "./lib/editorial-packet.mjs";
import { gitBlobSha } from "./lib/edition-state.mjs";
const exec = promisify(execFile);

describe("calendar packet integration", () => {
  it("carries a large illustrated calendar into the next Daily without starving news or losing baseline items", async () => {
    const root = await mkdtemp(join(tmpdir(), "calendar-next-day-"));
    await mkdir(join(root, "public/data"), { recursive: true });
    await mkdir(join(root, "config"));
    for (const name of ["release-calendar-sources.json", "title-translations.json"]) await copyFile(resolve("config", name), join(root, "config", name));
    const items = Array.from({ length: 300 }, (_, i) => ({ id: `release-${i}`, date: "10.08", title: { title_key: `game-${i}`, title_en: `Game ${i}` }, platforms: ["PC"], region: "美国", releaseType: "正式发售", note: "verified source context ".repeat(30), source: { url: `https://store.steampowered.com/app/${i+1}/`, label: "Steam", kind: "primary" }, cover: { url: `media/${i}.jpg`, alt: `Game ${i}`, credit: "Steam" } }));
    await writeFile(join(root, "public/data/latest.json"), JSON.stringify({ id: "2026-10-04-daily", upcoming: items }));
    await writeFile(join(root, "public/data/manifest.json"), JSON.stringify({ editions: [] }));
    const evidence = { window: expectedEditorialWindow("2026-10-05-daily"), packages: [{ eventKey: "news-still-delivered", subjectKey: "test-game", headline: "Confirmed game update", sources: [{ status: "opened", kind: "primary", label: "Official", url: "https://official.example/update", evidenceText: "Confirmed game update details.".repeat(100) }] }] };
    await writeFile(join(root, "evidence.json"), JSON.stringify(evidence));
    await writeFile(join(root, "report.json"), JSON.stringify({ editionDate: "2026-10-05", window: { startInclusive: "2026-10-06", endInclusive: "2026-10-20" }, coverage: [], allCandidates: [], candidates: [], reviewLinks: [] }));
    await exec(process.execPath, [resolve("scripts/editorialize.mjs")], { cwd: root, env: { ...process.env, NEWS_EVIDENCE_PATH: join(root, "evidence.json"), EDITORIAL_PACKET_PATH: join(root, "packet.json"), RELEASE_CALENDAR_REPORT_PATH: join(root, "report.json"), REUSE_RELEASE_CALENDAR_REPORT: "true", EVENT_LEDGER_PATH: join(root, "absent-ledger.json"), TITLE_HINTS_PATH: join(root, "absent-hints.json") } });
    const packet = JSON.parse(await readFile(join(root, "packet.json"), "utf8"));
    expect(packet.editorialInput.packages.map(x => x.eventKey)).toEqual(["news-still-delivered"]);
    expect(JSON.stringify(packet.editorialInput).length).toBeLessThan(120000);
    expect(packet.editorialInput.upcomingBaseline.itemCount).toBe(300);
    expect(packet.editorialInput.upcomingBaseline.items).toEqual([]);
    const restored = [];
    for (const page of packet.editorialInput.calendarWork.pages) {
      const text = await readFile(join(root, "editorial-batches", page.name), "utf8");
      expect(gitBlobSha(text)).toBe(page.blobSha);
      expect(text.length).toBeLessThanOrEqual(24000);
      restored.push(...JSON.parse(text).items.filter(x=>x.kind==="baseline-check").map(x=>x.baseline.item));
    }
    expect(restored).toEqual(items);
    expect(validateFinalizedEditorialPacket(packet, { editionId: "2026-10-05-daily", period: "daily" })).toEqual([]);
  }, 20000);
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
    const workItems = [];
    for (const receipt of packet.editorialInput.calendarWork.pages) workItems.push(...JSON.parse(await readFile(join(root, "editorial-batches", receipt.name), "utf8")).items);
    expect(workItems.filter(item=>item.kind==="candidate").map(item=>item.candidate.title)).toEqual(["Game beyond inline preview"]);
    expect(packet.editorialInput.calendarWork.totalTasks).toBe(1 + packet.editorialInput.upcomingBaseline.itemCount);
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
    // Keep the historical health fixture within its retention window in the child process.
    const fixedClock = 'const RealDate = Date; globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ["2026-09-20T04:00:00.000Z"])); } static now() { return RealDate.parse("2026-09-20T04:00:00.000Z"); } };';
    await writeFile(preload, fixedClock + 'globalThis.fetch = async url => new Response(String(url).includes("news.xbox.com") ? "<rss><channel></channel></rss>" : "<html></html>");');
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
