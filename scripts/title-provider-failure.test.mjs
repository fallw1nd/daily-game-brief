import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("stops a billing failure after the two in-flight requests and retains unqueried subjects across retries", async () => {
  const root = await mkdtemp(join(tmpdir(), "brief-title-provider-"));
  try {
    const evidence = join(root, "evidence.json");
    const output = join(root, "hints.json");
    const cache = join(root, "cache.json");
    await writeFile(evidence, JSON.stringify({ window: { id: "2026-09-10-daily" }, packages: Array.from({ length: 30 }, (_, index) => ({ subjectKey: `Unregistered Fixture ${index}` })) }));
    const run = () => promisify(execFile)(process.execPath, ["--import", "data:text/javascript,globalThis.fetch%3Dasync()%3D%3Enew%20Response('',%7Bstatus%3A402%7D)", resolve("scripts/build-title-hints.mjs")], { env: { ...process.env, DEEPSEEK_API_KEY: "fixture-no-network", NEWS_EVIDENCE_PATH: evidence, TITLE_HINTS_PATH: output, TITLE_CACHE_PATH: cache, SHOWCASE_REPORT_PATH: join(root, "absent-showcase.json"), RELEASE_CALENDAR_REPORT_PATH: join(root, "absent-calendar.json") } });
    await run();
    const first = JSON.parse(await readFile(output, "utf8"));
    expect(first.providerStatus).toBe("unavailable");
    expect(first.providerFailure.reason).toContain("HTTP 402");
    expect(first.queriedSubjects).toBe(2);
    expect(first.queuedSubjects).toBeGreaterThanOrEqual(28);
    expect(first.hints).toEqual([]);
    const stored = JSON.parse(await readFile(cache, "utf8"));
    expect(Object.values(stored.records).every(record => record.outcome === "error")).toBe(true);
    await run();
    const retry = JSON.parse(await readFile(output, "utf8"));
    expect(retry.queriedSubjects).toBe(0);
    expect(retry.queuedSubjects).toBe(first.queuedSubjects);
  } finally { await rm(root, { recursive: true, force: true }); }
});
