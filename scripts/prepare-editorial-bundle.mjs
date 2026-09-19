import { gitBlobSha, applyEditionStateEvent, EDITORIAL_CONTINUATION_REASON } from "./lib/edition-state.mjs";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";
import { advanceEditorialQueue } from "./lib/editorial-queue.mjs";
import { buildEdition } from "./lib/edition-publisher.mjs";
import { assertEditorialBundle, completedPacketCycles } from "./lib/editorial-bundle.mjs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const bundlePath = resolve(process.env.EDITORIAL_BUNDLE_PATH || "artifacts/editorial-bundle.json");
const stateRoot = resolve(process.env.EDITORIAL_STATE_ROOT || "automation-state");
const packetDir = resolve(process.env.EDITORIAL_BUNDLE_PACKET_DIR || "artifacts/editorial-bundle-packets");
const planPath = resolve(process.env.EDITORIAL_BUNDLE_PLAN_PATH || "artifacts/editorial-bundle-plan.json");
const branchName = process.env.EDITORIAL_BRANCH || process.env.GITHUB_REF_NAME || "";

const sourceBundle = JSON.parse(await readFile(bundlePath, "utf8"));
const editionId = sourceBundle.editionId;
if (!expectedEditorialWindow(editionId)) throw new Error("bundle editionId is invalid");
if (!/^automation\/editorial\/\d{4}-\d{2}-\d{2}-(?:am|pm|daily)$/u.test(branchName)) throw new Error("bundle branch is not edition-scoped");
if (branchName !== `automation/editorial/${editionId}`) throw new Error("bundle branch and edition do not match");
if (sourceBundle.schemaVersion !== 1 || !Array.isArray(sourceBundle.submissions) || !sourceBundle.submissions.length) throw new Error("bundle must use schemaVersion=1 with submissions");
if (sourceBundle.submissions.length > 2) throw new Error("bundle has more than the initial two-submission experiment limit");

const statePath = resolve(stateRoot, `automation/status/${editionId}.json`);
const state = JSON.parse(await readFile(statePath, "utf8"));
const manifest = JSON.parse(await readFile("public/data/manifest.json", "utf8"));
const targetManifest = manifest.editions.find(item => item.id === editionId);
const canonical = targetManifest
  ? JSON.parse(await readFile(resolve("public/data", targetManifest.path), "utf8"))
  : JSON.parse(await readFile("public/data/latest.json", "utf8"));
const queuePath = resolve(stateRoot, `automation/batches/${editionId}/queue.json`);
let queue = null;
try { queue = JSON.parse(await readFile(queuePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }

async function stateCommit() {
  return (await run("git", ["-C", stateRoot, "rev-parse", "HEAD"])).stdout.trim();
}

async function readPacketBySha(sha) {
  const candidates = [
    resolve(stateRoot, `automation/packets/${editionId}.json`),
  ];
  for (const candidate of candidates) {
    try {
      const text = await readFile(candidate, "utf8");
      if (gitBlobSha(text) === sha) return text;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const text = (await run("git", ["cat-file", "blob", sha])).stdout;
  if (gitBlobSha(text) !== sha) throw new Error(`packet blob ${sha} failed byte verification`);
  return text;
}

async function queuePackets() {
  if (!queue) return {};
  const packets = {};
  for (const batch of queue.batches.filter(item => item.status !== "completed")) {
    const text = await readFile(resolve(stateRoot, `automation/batches/${editionId}/${batch.name}`), "utf8");
    packets[batch.name] = text;
  }
  return packets;
}

function packetQueueKeys(packet) {
  if (packet.continuation?.scope === "showcase") {
    return [...new Set((packet.editorialInput?.packages || []).flatMap(item => (item.showcaseRefs || []).map(ref => ref.announcementId)))].sort();
  }
  return [...new Set((packet.editorialInput?.packages || []).map(item => item.eventKey))].sort();
}

function queueBatchForPacket(packetText, preferredName = null) {
  const packet = JSON.parse(packetText);
  const scope = packet.continuation?.scope || "canonical";
  if (scope === "canonical" || !queue) return null;
  const keys = packetQueueKeys(packet).join("\u0000");
  const matches = queue.batches.filter(batch => batch.scope === scope && [...new Set(batch.eventKeys || [])].sort().join("\u0000") === keys);
  if (preferredName) {
    const preferred = matches.find(batch => batch.name === preferredName);
    if (preferred) return preferred;
  }
  return matches.length === 1 ? matches[0] : null;
}

function trustedBatchForPacket(packetText, preferredName = null) {
  const packet = JSON.parse(packetText);
  if ((packet.continuation?.scope || "canonical") === "canonical") return null;
  const batch = queueBatchForPacket(packetText, preferredName);
  if (!batch) throw new Error(`trusted ${packet.continuation.scope} packet has no unique queue batch identity`);
  return batch;
}

function candidateFromPacket({ packetText, batch = null, snapshot }) {
  const packet = JSON.parse(packetText);
  return {
    packetBlobSha: gitBlobSha(packetText),
    scope: packet.continuation?.scope || "canonical",
    batchName: batch?.name || null,
    eventKeys: batch?.eventKeys?.length ? batch.eventKeys : packet.editorialInput.packages.map(item => item.eventKey),
    queueSnapshot: snapshot,
    packetText,
  };
}

function assertStateCanBeEdited(current) {
  if (current.packet?.status !== "ready") throw new Error("bundle requires an acknowledged ready packet");
  if (!["pending", "invalid", "valid"].includes(current.editorial?.status)) throw new Error("bundle cannot cross a submitted, timed-out, or committed editorial lane");
  if (current.publication?.status === "committed") throw new Error("bundle cannot reopen a committed publication");
  if (current.revisionRequest?.status === "open" && current.revisionRequest.reason === "user_authorized_same_edition_revision") {
    throw new Error("bundle cannot cross an open manual revision");
  }
}

async function activeCandidate(current, snapshot) {
  assertStateCanBeEdited(current);
  const text = await readPacketBySha(current.packet.blobSha);
  const batch = trustedBatchForPacket(text,
    current.revisionRequest?.status === "open" && current.revisionRequest.reason === EDITORIAL_CONTINUATION_REASON
      ? current.revisionRequest.batchName
      : queue?.activeBatchName || null);
  return candidateFromPacket({ packetText: text, batch, snapshot });
}

function priorContinuation(transitions, packetRevision) {
  return [...transitions]
    .filter(item => item.revision < packetRevision && (item.event === "continuation-opened" || item.event === "supplement-opened"))
    .at(-1) || null;
}

/**
 * A rerun may see packet N+1 active while packet N is already in main. The
 * packet SHA is accepted only when the durable state history contains the
 * matching packet acknowledgement, validation, and publication commit; the
 * editor cannot turn an arbitrary requested blob into a replay candidate.
 */
async function alreadyPublishedCandidate(requested, current, snapshot, index, total) {
  const requestedSha = requested.editorial?.packetBlobSha || requested.requestedPacketBlobSha;
  if (!/^[0-9a-f]{40}$/u.test(String(requestedSha || ""))) return null;
  const transitions = Array.isArray(current.transitions) ? current.transitions : [];
  const completed = completedPacketCycles(transitions);
  const historical = completed.slice(-Math.min(completed.length, total));
  const expectedCycle = current.publication?.status === "committed"
    ? historical[index]
    : index === 0 ? completed.at(-1) : null;
  if (expectedCycle?.ready?.packetBlobSha !== requestedSha) return null;
  const text = await readPacketBySha(requestedSha);
  const continuation = priorContinuation(transitions, expectedCycle.ready.revision);
  const batch = trustedBatchForPacket(text, continuation?.batchName || null);
  return candidateFromPacket({ packetText: text, batch, snapshot });
}

async function nextQueueCandidate(currentState, currentQueue, projectedCanonical, snapshot) {
  if (!currentQueue) return null;
  const packetMap = await queuePackets();
  const result = advanceEditorialQueue({
    queue: currentQueue,
    state: currentState,
    canonical: projectedCanonical,
    packets: packetMap,
    now: new Date().toISOString(),
  });
  if (!result.packet) return null;
  return { result, candidate: candidateFromPacket({ packetText: result.packet, batch: result.batch, snapshot }) };
}

async function queueBlobSha(queueValue) {
  return gitBlobSha(JSON.stringify(queueValue || {}, null, 2) + "\n");
}

async function projectPublication(currentState, currentQueue, candidate, editorial, projectedLatest, projectedManifest) {
  let projectedState = currentState;
  const submissionSha = "a".repeat(40);
  if (projectedState.editorial.status !== "valid") {
    projectedState = applyEditionStateEvent(projectedState, "editorial-submitted", {
      packetBlobSha: candidate.packetBlobSha,
      submissionSha,
    });
    projectedState = applyEditionStateEvent(projectedState, "editorial-valid", {
      packetBlobSha: candidate.packetBlobSha,
      submissionSha,
    });
  }
  projectedState = applyEditionStateEvent(projectedState, "publication-committed", {
    mainSha: "b".repeat(40),
    source: "editorial",
  });
  let projectedCanonical = projectedLatest;
  let nextManifest = projectedManifest;
  try {
    const built = buildEdition({
      packet: JSON.parse(candidate.packetText),
      editorial,
      latest: projectedLatest,
      manifest: projectedManifest,
      allowSameEditionRevision: candidate.scope !== "canonical",
    });
    if (built.edition) projectedCanonical = built.edition;
    if (built.manifest) nextManifest = built.manifest;
  } catch {
    // The final trusted publisher remains the authority; queue planning only
    // needs a conservative canonical projection for showcase coverage.
  }
  return { projectedState, projectedCanonical, projectedManifest: nextManifest, projectedQueue: currentQueue };
}

const sourceStateCommit = await stateCommit();
let simulatedState = state;
let simulatedQueue = queue;
let projectedCanonical = canonical;
let projectedManifest = manifest;
const resolved = [];
for (const [index, requested] of sourceBundle.submissions.entries()) {
  const snapshot = {
    stateCommit: sourceStateCommit,
    queueBlobSha: await queueBlobSha(simulatedQueue),
  };
  let candidate;
  let replay = false;
  const historical = await alreadyPublishedCandidate(requested, simulatedState, snapshot, index, sourceBundle.submissions.length);
  if (historical) {
    candidate = historical;
    replay = true;
  } else if (simulatedState.packet?.status === "ready" && ["pending", "invalid", "valid"].includes(simulatedState.editorial?.status) && simulatedState.publication?.status !== "committed") {
    candidate = await activeCandidate(simulatedState, snapshot);
  } else {
    const next = await nextQueueCandidate(simulatedState, simulatedQueue, projectedCanonical, snapshot);
    if (!next) throw new Error(`no trusted queue candidate is available for bundle submission ${index}`);
    candidate = next.candidate;
    simulatedState = next.result.state;
    simulatedQueue = next.result.queue;
  }
  for (const field of ["requestedPacketBlobSha", "requestedBatchName", "requestedScope", "requestedEventKeys"]) {
    if (requested[field] == null) continue;
    const actual = field === "requestedPacketBlobSha" ? candidate.packetBlobSha
      : field === "requestedBatchName" ? candidate.batchName
        : field === "requestedScope" ? candidate.scope
          : [...candidate.eventKeys].sort();
    const requestedValue = field === "requestedEventKeys" ? [...requested[field]].sort() : requested[field];
    if (JSON.stringify(requestedValue) !== JSON.stringify(actual)) throw new Error(`bundle request ${field} does not match GitHub's ordered queue candidate at index ${index}`);
  }
  const editorial = structuredClone(requested.editorial);
  if (editorial.packetBlobSha && editorial.packetBlobSha !== candidate.packetBlobSha) throw new Error(`editorial packetBlobSha does not match the GitHub-resolved candidate at index ${index}`);
  editorial.packetBlobSha = candidate.packetBlobSha;
  resolved.push({
    index,
    packetBlobSha: candidate.packetBlobSha,
    scope: candidate.scope,
    batchName: candidate.batchName,
    eventKeys: candidate.eventKeys,
    queueSnapshot: snapshot,
    editorial,
  });
  if (!replay) {
    const projected = await projectPublication(simulatedState, simulatedQueue, candidate, editorial, projectedCanonical, projectedManifest);
    simulatedState = projected.projectedState;
    projectedCanonical = projected.projectedCanonical;
    projectedManifest = projected.projectedManifest;
  }
}

const packetTextsBySha = new Map();
for (const submission of resolved) {
  const text = await readPacketBySha(submission.packetBlobSha);
  packetTextsBySha.set(submission.packetBlobSha, text);
  await mkdir(packetDir, { recursive: true });
  await writeFile(resolve(packetDir, `${submission.packetBlobSha}.json`), text);
}
const plan = {
  schemaVersion: 1,
  editionId,
  generatedAt: new Date().toISOString(),
  sourceStateCommit,
  sourceQueueBlobSha: await queueBlobSha(queue),
  submissions: resolved,
};
plan.serializedChars = resolved.reduce((total, item) => total + JSON.stringify({ packet: JSON.parse(packetTextsBySha.get(item.packetBlobSha)), editorial: item.editorial }).length, 0);
assertEditorialBundle(plan, { branchName, packetTextsBySha });
await mkdir(dirname(planPath), { recursive: true });
await writeFile(planPath, JSON.stringify(plan, null, 2) + "\n");
console.log(JSON.stringify({ editionId, sourceStateCommit, submissions: resolved.map(item => ({ index: item.index, scope: item.scope, batchName: item.batchName, packetBlobSha: item.packetBlobSha, eventKeys: item.eventKeys })), serializedChars: plan.serializedChars }, null, 2));
