import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { advanceShowcaseQueue } from "./lib/showcase-queue.mjs";
import { showcaseRetryDue } from "./lib/showcase.mjs";
import { mergeShowcaseReports, refreshedShowcaseBatches } from "./lib/showcase-refresh.mjs";

const root = resolve(process.argv.find(arg => arg.startsWith("--state-root="))?.slice(13) || ".");
const manifest = JSON.parse(await readFile("public/data/manifest.json", "utf8"));
let refreshed = false;
for (const edition of manifest.editions) {
  const canonical = JSON.parse(await readFile(resolve("public/data", edition.path), "utf8"));
  const queuePath = resolve(root, `automation/batches/${canonical.id}/queue.json`);
  let queue;
  try { queue = JSON.parse(await readFile(queuePath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") continue; throw error; }
  const statePath = resolve(root, `automation/status/${canonical.id}.json`);
  const state = JSON.parse(await readFile(statePath, "utf8"));
  // Only the twice-daily recovery lane reopens source pages. Publication commits
  // remain fast, and no in-flight or manual packet is changed.
  const due = queue.batches.some(batch => batch.scope === "showcase" && batch.status === "awaiting_retry" && showcaseRetryDue(queue.firstPublishedAt, batch.retryAttempts || 0));
  if (process.argv.includes("--refresh-sources") && !refreshed && due && state.publication.status === "committed" && state.revisionRequest?.status !== "open") {
    const reportPath = resolve(root, `automation/batches/${canonical.id}/showcase-evidence.json`);
    let previous;
    try { previous = JSON.parse(await readFile(reportPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (previous?.events?.length) {
      refreshed = true;
      const temporary = resolve("artifacts", `showcase-refresh-${canonical.id}`);
      await mkdir(temporary, { recursive: true });
      const windowPath = resolve(temporary, "window.json");
      const freshPath = resolve(temporary, "evidence.json");
      await writeFile(windowPath, JSON.stringify({ window: previous.window }));
      try {
        await promisify(execFile)(process.execPath, ["scripts/collect-showcases.mjs"], { timeout: 180000, env: { ...process.env, NEWS_SHADOW_REPORT_PATH: windowPath, SHOWCASE_EVENTS_PATH: reportPath, SHOWCASE_REPORT_PATH: freshPath, SHOWCASE_SAVE_PAGES: "false" } });
        const report = mergeShowcaseReports(previous, JSON.parse(await readFile(freshPath, "utf8")));
        const candidate = queue.batches.find(batch => batch.scope === "showcase");
        if (!/^[\w-]+\.json$/.test(candidate?.name || "")) throw new Error("invalid recovery template filename");
        const template = JSON.parse(await readFile(resolve(root, `automation/batches/${canonical.id}/${candidate.name}`), "utf8"));
        const generation = (queue.refreshGeneration || 0) + 1;
        const batches = refreshedShowcaseBatches({ report, canonical, template, generation });
        const retryAttempts = Math.max(0, ...queue.batches.filter(batch => batch.scope === "showcase").map(batch => batch.retryAttempts || 0)) + 1;
        for (const batch of batches) batch.retryAttempts = retryAttempts;
        for (const batch of batches) await writeFile(resolve(root, `automation/batches/${canonical.id}/${batch.name}`), JSON.stringify(batch.packet, null, 2) + "\n");
        queue.batches = [...queue.batches.filter(batch => batch.scope !== "showcase" || batch.status === "completed"), ...batches.map(({ packet, ...batch }) => batch)];
        queue.totalAnnouncements = report.announcements.length;
        queue.requiredFacts = Object.fromEntries(report.announcements.map(item => [item.id, (item.factUnits || []).map(fact => fact.id)]));
        queue.refreshGeneration = generation;
        queue.lastRefreshAt = report.generatedAt;
        delete queue.refreshError;
        await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
      } catch (error) {
        queue.refreshError = { at: new Date().toISOString(), message: error.message.slice(0, 500) };
        console.error(`${canonical.id}: source recovery failed; retained durable evidence: ${queue.refreshError.message}`);
      }
    }
  }
  const packets = Object.fromEntries(await Promise.all(queue.batches.filter(batch => batch.scope === "showcase" && batch.status !== "completed").map(async batch => {
    if (!/^[\w-]+\.json$/.test(batch.name)) throw new Error("invalid batch filename");
    return [batch.name, await readFile(resolve(root, `automation/batches/${canonical.id}/${batch.name}`), "utf8")];
  })));
  const result = advanceShowcaseQueue({ queue, state, canonical, packets });
  await writeFile(queuePath, JSON.stringify(result.queue, null, 2) + "\n");
  if (result.packet) {
    await writeFile(resolve(root, `automation/packets/${canonical.id}.json`), result.packet);
    await writeFile(statePath, JSON.stringify(result.state, null, 2) + "\n");
  }
  console.log(JSON.stringify({ editionId: canonical.id, remaining: result.queue.remainingAnnouncements, activated: Boolean(result.packet) }));
}
