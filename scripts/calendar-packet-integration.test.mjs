// @vitest-environment node
import { pathToFileURL } from "node:url";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { expectedEditorialWindow, validateFinalizedEditorialPacket } from "./lib/editorial-packet.mjs";
const exec = promisify(execFile);

describe("calendar packet integration", () => {
  it("runs the real handoff builder with a failed discovery network without breaking news or inventing releases", async () => {
    const root = await mkdtemp(join(tmpdir(), "calendar-packet-"));
    const evidencePath = join(root, "evidence.json");
    const packetPath = join(root, "packet.json");
    const preload = join(root, "offline.mjs");
    await writeFile(evidencePath, JSON.stringify({ window: expectedEditorialWindow("2026-09-08-daily"), packages: [] }));
    await writeFile(preload, 'globalThis.fetch = async () => { throw new Error("test outage"); };');
    await exec(process.execPath, ["--import", pathToFileURL(preload).href, "scripts/editorialize.mjs"], {
      cwd: resolve("."), env: { ...process.env, NEWS_EVIDENCE_PATH: evidencePath, EDITORIAL_PACKET_PATH: packetPath, RELEASE_CALENDAR_REPORT_PATH: join(root, "report.json"), EVENT_LEDGER_PATH: join(root, "absent.json"), TITLE_HINTS_PATH: join(root, "absent-hints.json") },
    });
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    expect(validateFinalizedEditorialPacket(packet, { editionId: "2026-09-08-daily", period: "daily" })).toEqual([]);
    expect(packet.editorialInput.upcomingDiscovery.coverage.every(s => s.status === "failed")).toBe(true);
    expect(packet.editorialInput.upcomingDiscovery.candidates).toEqual([]);
    expect(packet.editorialInput.packages).toEqual([]);
    expect(packet.editorialInput.upcomingBaseline.refreshRange).toEqual({ startInclusive: "2026-09-09", endInclusive: "2026-09-23" });
    expect(packet.editorialInput.budget.usedInputChars).toBeLessThanOrEqual(packet.editorialInput.budget.maxInputChars);
  }, 20000);
});
