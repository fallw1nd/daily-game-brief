import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { applyEditionStateEvent, editionStatePath, gitBlobSha, validateEditionState } from "./lib/edition-state.mjs";

function argument(name) {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
}
async function optionalJson(path) {
  if (!path) return null;
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

const editionId = argument("edition");
const event = argument("event");
const stateRoot = resolve(argument("state-root") || ".");
const relativePath = editionStatePath(editionId);
const outputPath = resolve(stateRoot, relativePath);
let current = null;
try { current = JSON.parse(await readFile(outputPath, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const packetPath = argument("packet");
const packetContent = packetPath ? await readFile(resolve(packetPath)) : null;
const decision = await optionalJson(argument("decision"));
const validation = await optionalJson(argument("validation"));
const packetBlobSha = argument("packet-blob-sha") || decision?.packetBlobSha || (packetContent ? gitBlobSha(packetContent) : "");
let superseded = false;
if (event.startsWith("deployment-") && current?.deployment?.mainSha && argument("main-sha")) {
  const incoming = argument("main-sha");
  const recorded = current.deployment.mainSha;
  if (!/^[a-f0-9]{40}$/.test(incoming) || !/^[a-f0-9]{40}$/.test(recorded)) throw new Error("invalid deployment SHA");
  if (incoming !== recorded) {
    // Fetching occurs in the caller; fail visibly if ancestry cannot be resolved.
    for (const sha of [incoming, recorded]) execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`]);
    try { execFileSync("git", ["merge-base", "--is-ancestor", incoming, recorded]); superseded = true; }
    catch (error) { if (error.status !== 1) throw error; }
  }
}
const eventData = {
  superseded,
  editionId, packetBlobSha, submissionSha: argument("submission-sha"), mainSha: argument("main-sha"),
  source: argument("source"), status: argument("status"), reason: argument("reason"), error: argument("error"),
  decisionDigest: argument("decision-digest"),
  validationErrors: validation?.errors || [], runId: argument("run-id") || process.env.GITHUB_RUN_ID || null,
  actor: argument("actor") || "github-orchestrator", at: argument("at") || new Date().toISOString(),
};
let next;
let nextQueue = null;
const queuePath = resolve(stateRoot, `automation/batches/${editionId}/queue.json`);
if (event === "revision-opened" && current?.revisionRequest?.status === "open"
  && current.revisionRequest.reason === "editorial_continuation") {
  const { openManualRevision } = await import("./lib/editorial-queue.mjs");
  const queue = await optionalJson(queuePath);
  const name = current.revisionRequest.batchName;
  // Validate before using the durable name as a filesystem component.
  const priorErrors = validateEditionState(current);
  if (priorErrors.length) throw new Error(priorErrors.join("; "));
  const packet = await readFile(resolve(stateRoot, `automation/batches/${editionId}/${name}`), "utf8");
  ({ state: next, queue: nextQueue } = openManualRevision({ state: current, queue, packets: { [name]: packet }, ...eventData }));
} else {
  next = applyEditionStateEvent(current, event, eventData);
}
const errors = validateEditionState(next);
if (errors.length) throw new Error(`refusing to write invalid edition state:\n- ${errors.join("\n- ")}`);
if (nextQueue) await writeFile(queuePath, JSON.stringify(nextQueue, null, 2) + "\n");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(next, null, 2) + "\n");
console.log(JSON.stringify({ editionId, event, revision: next.revision, path: relativePath, packetBlobSha: next.packet.blobSha }, null, 2));
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `state_path=${relativePath}\npacket_blob_sha=${next.packet.blobSha || ""}\nrevision=${next.revision}\n`);
