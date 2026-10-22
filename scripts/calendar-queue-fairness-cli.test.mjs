// @vitest-environment node
import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createEditionState, applyEditionStateEvent } from "./lib/edition-state.mjs";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";
import { deferredCalendarReview } from "./lib/calendar-review.mjs";

it("the real global sweep offers unattempted calendar work before an old eligible retry", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "calendar-fairness-"));
  const observed = JSON.parse(await readFile("scripts/fixtures/release-calendar/continuation-budget-blocker.json", "utf8"));
  const page = observed.source.pageBlobSha;
  const calendarWork = { pages: [{ blobSha: page }] };
  const ids = [observed.editionId, "2026-10-20-daily"];
  const write = async (path, value) => { await mkdir(resolve(root, path, ".."), { recursive: true }); await writeFile(resolve(root, path), JSON.stringify(value)); };
  try {
    await mkdir(resolve(root, "automation/packets"), { recursive: true });
    await write("public/data/manifest.json", { editions: ids.map((id, index) => ({ id, issueNumber: index + 1, path: `${id}.json` })) });
    for (const [index, id] of ids.entries()) {
      const at = `${id.slice(0, 10)}T04:00:00.000Z`;
      let state = createEditionState(id, at);
      state = applyEditionStateEvent(state, "packet-ready", { packetBlobSha: "1".repeat(40), at });
      state = applyEditionStateEvent(state, "editorial-submitted", { packetBlobSha: "1".repeat(40), submissionSha: "2".repeat(40), at });
      state = applyEditionStateEvent(state, "editorial-valid", { packetBlobSha: "1".repeat(40), submissionSha: "2".repeat(40), at });
      state = applyEditionStateEvent(state, "publication-committed", { mainSha: "3".repeat(40), source: "editorial", at });
      await write(`automation/status/${id}.json`, state);
      await write(`public/data/${id}.json`, { id, entries: [], sourceReport: { calendarReview: deferredCalendarReview(calendarWork, observed.source.error) } });
      const window = expectedEditorialWindow(id);
      await write(`automation/batches/${id}/calendar.json`, { schemaVersion: 3, mode: "chatgpt-handoff", finalizedAt: at,
        coverageThrough: window.windowEnd, outputSchema: {}, continuation: { scope: "calendar", preservePublished: true },
        editorialInput: { schemaVersion: 2, window, packages: [], trackingQueue: [], calendarWork } });
      await write(`automation/batches/${id}/queue.json`, { editionId: id, firstPublishedAt: at, batches: [{ name: "calendar.json", scope: "calendar", eventKeys: [page],
        status: index === 0 ? "awaiting_retry" : "pending", ...(index === 0 ? { activatedAt: at, retryAttempts: 0 } : {}) }] });
    }
    const output = execFileSync(process.execPath, [resolve("scripts/advance-showcase-queue.mjs"), `--state-root=${root}`], { cwd: root, encoding: "utf8" });
    expect(output).toContain(`"editionId":"${ids[1]}","remaining":0,"activated":true`);
    const old = JSON.parse(await readFile(resolve(root, `automation/batches/${ids[0]}/queue.json`), "utf8"));
    expect(old.batches[0].status).toBe("awaiting_retry");
    const active = JSON.parse(await readFile(resolve(root, `automation/status/${ids[1]}.json`), "utf8"));
    expect(active.revisionRequest).toMatchObject({ status: "open", batchScope: "calendar", eventKeys: [page] });
  } finally { await rm(root, { recursive: true, force: true }); }
});
