import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
const next = applyEditionStateEvent(current, event, {
  editionId, packetBlobSha, submissionSha: argument("submission-sha"), mainSha: argument("main-sha"),
  source: argument("source"), status: argument("status"), reason: argument("reason"), error: argument("error"),
  validationErrors: validation?.errors || [], runId: argument("run-id") || process.env.GITHUB_RUN_ID || null,
  actor: argument("actor") || "github-orchestrator", at: argument("at") || new Date().toISOString(),
});
const errors = validateEditionState(next);
if (errors.length) throw new Error(`refusing to write invalid edition state:\n- ${errors.join("\n- ")}`);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(next, null, 2) + "\n");
console.log(JSON.stringify({ editionId, event, revision: next.revision, path: relativePath, packetBlobSha: next.packet.blobSha }, null, 2));
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `state_path=${relativePath}\npacket_blob_sha=${next.packet.blobSha || ""}\nrevision=${next.revision}\n`);
