import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { advanceShowcaseQueue } from "./lib/showcase-queue.mjs";

const root = resolve(process.argv.find(arg => arg.startsWith("--state-root="))?.slice(13) || ".");
const canonical = JSON.parse(await readFile("public/data/latest.json", "utf8"));
const queuePath = resolve(root, `automation/batches/${canonical.id}/queue.json`);
let queue;
try { queue = JSON.parse(await readFile(queuePath, "utf8")); }
catch (error) { if (error.code === "ENOENT") { console.log("No current showcase queue."); process.exit(0); } throw error; }
const statePath = resolve(root, `automation/status/${canonical.id}.json`);
const state = JSON.parse(await readFile(statePath, "utf8"));
const packets = Object.fromEntries(await Promise.all(queue.batches.filter(batch => batch.scope === "showcase" && batch.status === "pending").map(async batch => {
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
