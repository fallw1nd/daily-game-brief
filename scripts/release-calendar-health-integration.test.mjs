// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const cli = resolve("scripts/update-release-calendar-health.mjs");
const invoke = (previousPath, reportPath, outputPath) => exec(process.execPath, [cli], {
  cwd: resolve("."),
  env: {
    ...process.env,
    RELEASE_CALENDAR_HEALTH_PREVIOUS_PATH: previousPath,
    RELEASE_CALENDAR_REPORT_PATH: reportPath,
    RELEASE_CALENDAR_HEALTH_PATH: outputPath,
  },
});
const report = (fetchedAt, sourceStatus = "success") => ({
  editionDate: "2026-09-20",
  fetchedAt,
  coverage: [{
    sourceId: "steam", platform: "PC", family: "steam", sourceStatus,
    parserStatus: "unknown", status: "empty_or_changed", pages: 1,
    pagesAttempted: 1, pagesSucceeded: 1, pagesFailed: 0,
    parsedCount: 0, inWindow: 0, usefulLeads: 0, durationMs: 7, empty: true,
  }],
});

describe("release calendar health persistence integration", () => {
  it("executes the CLI against isolated paths and merges retries from the latest ledger", async () => {
    const root = await mkdtemp(join(tmpdir(), "calendar-health-merge-"));
    const previous = join(root, "calendar-health.json");
    const firstReport = join(root, "first-report.json");
    const olderReport = join(root, "older-report.json");
    await writeFile(firstReport, JSON.stringify(report("2026-09-20T05:00:00.000Z")));
    await writeFile(olderReport, JSON.stringify({ ...report("2026-09-20T04:00:00.000Z", "failed"), editionDate: "2026-09-19" }));

    await invoke(previous, firstReport, previous);
    const once = JSON.parse(await readFile(previous, "utf8"));
    await invoke(previous, firstReport, previous);
    expect(JSON.parse(await readFile(previous, "utf8"))).toEqual(once);
    await invoke(previous, olderReport, previous);

    const merged = JSON.parse(await readFile(previous, "utf8"));
    expect(merged.sources.steam.recent.map(item => item.editionDate)).toEqual(["2026-09-19", "2026-09-20"]);
    expect(merged.sources.steam.lastObservedAt).toBe("2026-09-20T05:00:00.000Z");
    expect(merged.sources.steam.lastFetchStatus).toBe("success");
    expect(merged.sources.steam.lastParsedCount).toBe(0);
  });

  it.each(["", "{broken"])("diagnoses empty or malformed previous state (%s) and continues", async (contents) => {
    const root = await mkdtemp(join(tmpdir(), "calendar-health-rebuild-"));
    const previous = join(root, "previous.json");
    const currentReport = join(root, "report.json");
    const output = join(root, "output.json");
    await writeFile(previous, contents);
    await writeFile(currentReport, JSON.stringify(report("2026-09-20T05:00:00.000Z")));
    await invoke(previous, currentReport, output);
    const ledger = JSON.parse(await readFile(output, "utf8"));
    expect(ledger.diagnostics[0].code).toBe("malformed_previous_ledger");
    expect(ledger.sources.steam.recent).toHaveLength(1);
  });

  it("fails on an invalid report instead of swallowing it", async () => {
    const root = await mkdtemp(join(tmpdir(), "calendar-health-invalid-"));
    const currentReport = join(root, "report.json");
    await writeFile(currentReport, JSON.stringify({ editionDate: "2026-09-20", fetchedAt: "2026-09-20T05:00:00Z", coverage: [] }));
    await expect(invoke(join(root, "missing.json"), currentReport, join(root, "output.json"))).rejects.toThrow();
  });

  it("runs the real discovery CLI with isolated report and health paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "calendar-discover-cli-"));
    const preload = join(root, "offline.mjs");
    const reportPath = join(root, "report.json");
    const packetPath = join(root, "packet.json");
    const healthPath = join(root, "health.json");
    await writeFile(preload, 'globalThis.fetch = async () => { throw new Error("test outage"); };');
    await exec(process.execPath, ["--import", pathToFileURL(preload).href, "scripts/discover-release-calendar.mjs", "--date=2026-09-08"], {
      cwd: resolve("."),
      env: {
        ...process.env,
        RELEASE_CALENDAR_REPORT_PATH: reportPath,
        RELEASE_CALENDAR_PACKET_PATH: packetPath,
        RELEASE_CALENDAR_HEALTH_PATH: healthPath,
        RELEASE_CALENDAR_HEALTH_PREVIOUS_PATH: join(root, "missing-previous.json"),
      },
    });
    const discovery = JSON.parse(await readFile(reportPath, "utf8"));
    const ledger = JSON.parse(await readFile(healthPath, "utf8"));
    expect(discovery.coverage.filter(item => item.role === "base")).toHaveLength(6);
    expect(discovery.coverage.every(item => item.sourceStatus === "failed" && item.parserStatus === "unknown")).toBe(true);
    expect(discovery.fallbackTelemetry.actualFallbackAttempts).toHaveLength(2);
    expect(Object.keys(ledger.sources)).toHaveLength(8);
    expect(Object.values(ledger.sources).every(item => item.lastFetchStatus === "failed" && item.lastParserStatus === "unknown")).toBe(true);
  }, 20000);

  it("reads calendar-only history before strategy selection and records attempts only", async () => {
    const root = await mkdtemp(join(tmpdir(), "calendar-health-strategy-cli-"));
    const preload = join(root, "feeds.mjs");
    const reportPath = join(root, "report.json");
    const healthPath = join(root, "health.json");
    const previousPath = join(root, "previous.json");
    const recent = [1, 2, 3].map(() => ({
      editionDate: "2026-09-19", fetchedAt: "2026-09-19T04:00:00.000Z", sourceId: "playstation-ps5-rss",
      platform: "PlayStation", family: "playstation", fetchStatus: "failed", parserStatus: "failed",
      pages: { attempted: 1, succeeded: 0, failed: 1 }, parsedCount: 0, inWindowCandidates: 0,
      usefulLeads: 0, outcome: "failed", empty: null, changed: null, partialFailure: false, durationMs: 5,
    }));
    await writeFile(previousPath, JSON.stringify({ schemaVersion: 1, updatedAt: "2026-09-19T04:00:00.000Z", sources: {
      "playstation-ps5-rss": { sourceId: "playstation-ps5-rss", lastObservedAt: "2026-09-19T04:00:00.000Z", recent },
    } }));
    // Keep the historical health fixture within its retention window in the child process.
    const fixedClock = 'const RealDate = Date; globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ["2026-09-20T04:00:00.000Z"])); } static now() { return RealDate.parse("2026-09-20T04:00:00.000Z"); } };';
    await writeFile(preload, fixedClock + 'globalThis.fetch = async url => new Response(String(url).includes("news.xbox.com") ? "<rss><channel></channel></rss>" : "<html></html>");');
    await exec(process.execPath, ["--import", pathToFileURL(preload).href, "scripts/discover-release-calendar.mjs", "--date=2026-09-20"], {
      cwd: resolve("."), env: {
        ...process.env, RELEASE_CALENDAR_REPORT_PATH: reportPath,
        RELEASE_CALENDAR_HEALTH_PATH: healthPath, RELEASE_CALENDAR_HEALTH_PREVIOUS_PATH: previousPath,
      },
    });
    const discovery = JSON.parse(await readFile(reportPath, "utf8"));
    const ledger = JSON.parse(await readFile(healthPath, "utf8"));
    expect(discovery.fallbackTelemetry.fallbackDecisions.find(item => item.sourceId === "playstation-ps5-rss")).toMatchObject({ attempted: false, reason: "degraded_history_low_frequency_skip" });
    expect(discovery.fallbackTelemetry.actualFallbackAttempts).toEqual(["xbox-official-rss"]);
    expect(ledger.sources["playstation-ps5-rss"].recent).toHaveLength(3);
    expect(ledger.sources["xbox-official-rss"].recent).toHaveLength(1);
  }, 20000);
});
