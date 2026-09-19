import { validateEditorialSubmission } from "./editorial-submission.mjs";
import { validateFinalizedEditorialPacket } from "./editorial-packet.mjs";
import { gitBlobSha } from "./edition-state.mjs";

export const EDITORIAL_BUNDLE_SCHEMA_VERSION = 1;
export const MAX_BUNDLE_SUBMISSIONS = 2;
export const MAX_EDITORIAL_INPUT_CHARS = 120000;
export const MAX_BUNDLE_INPUT_CHARS = MAX_EDITORIAL_INPUT_CHARS * MAX_BUNDLE_SUBMISSIONS;
// Input budgets cover the provider-facing editorialInput. These larger limits
// cover the JSON transport envelope and the editor's response alongside it.
export const MAX_PACKET_SERIALIZED_CHARS = 240000;
export const MAX_BUNDLE_SERIALIZED_CHARS = MAX_PACKET_SERIALIZED_CHARS * MAX_BUNDLE_SUBMISSIONS;

const SAFE_BATCH_NAME = /^[\w-]+\.json$/u;
const SHA = /^[0-9a-f]{40}$/u;

function unique(values) {
  return [...new Set(values)];
}

function packageKeys(packet) {
  return (packet?.editorialInput?.packages || []).map(item => item.eventKey);
}

function resolvedScope(packet) {
  return packet?.continuation?.scope || "canonical";
}

function serializedChars(packet, editorial) {
  return JSON.stringify({ packet, editorial }).length;
}

function inputBudget(packet, index, errors) {
  const budget = packet?.editorialInput?.budget;
  const used = Number(budget?.usedInputChars);
  const max = Number(budget?.maxInputChars);
  if (!Number.isFinite(used) || !Number.isFinite(max) || used < 0 || max <= 0) {
    errors.push(`submissions[${index}] editorialInput.budget must expose numeric usedInputChars and maxInputChars`);
    return 0;
  }
  if (max > MAX_EDITORIAL_INPUT_CHARS) errors.push(`submissions[${index}] editorialInput.budget.maxInputChars exceeds ${MAX_EDITORIAL_INPUT_CHARS}`);
  if (used > max) errors.push(`submissions[${index}] editorialInput.budget.usedInputChars exceeds its declared input budget`);
  if (used > MAX_EDITORIAL_INPUT_CHARS) errors.push(`submissions[${index}] editorialInput input exceeds ${MAX_EDITORIAL_INPUT_CHARS} characters`);
  return used;
}

function completedCycleAt(transitions, index) {
  const packetSha = transitions[index]?.packetBlobSha;
  const nextStart = transitions.findIndex((item, candidateIndex) => candidateIndex > index && item.event === "packet-ready");
  const cycle = transitions.slice(index, nextStart === -1 ? transitions.length : nextStart);
  const publication = cycle.find(item => item.event === "publication-committed");
  if (!publication) return null;
  const valid = [...cycle]
    .filter(item => item.event === "editorial-valid" && item.revision < publication.revision)
    .at(-1);
  if (!valid) return null;
  const submitted = [...cycle]
    .filter(item => item.event === "editorial-submitted" && item.revision < valid.revision && item.submissionSha === valid.submissionSha)
    .at(-1);
  if (!submitted || submitted.packetBlobSha !== packetSha) return null;
  return { ready: cycle[0], submitted, valid, publication };
}

/**
 * Find completed packet cycles without crossing the next packet-ready
 * boundary. This keeps an invalid packet from borrowing a later packet's
 * valid/publication transitions during a retry plan.
 */
export function completedPacketCycles(transitions) {
  const ordered = Array.isArray(transitions) ? transitions : [];
  return ordered
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.event === "packet-ready")
    .map(({ index }) => completedCycleAt(ordered, index))
    .filter(Boolean);
}

export function completedPacketCycle(transitions, packetSha) {
  return completedPacketCycles(transitions)
    .filter(cycle => cycle.ready.packetBlobSha === packetSha)
    .at(-1) || null;
}

function identityErrors(submission, packet, index) {
  const errors = [];
  const scope = resolvedScope(packet);
  if (submission.scope !== scope) errors.push(`submissions[${index}].scope must be ${scope}`);
  const expectedKeys = unique(packageKeys(packet)).sort();
  const actualKeys = unique(submission.eventKeys || []).sort();
  if (expectedKeys.join("\u0000") !== actualKeys.join("\u0000")) {
    errors.push(`submissions[${index}].eventKeys must match the immutable packet packages`);
  }
  if (scope === "canonical") {
    if (submission.batchName != null) errors.push(`submissions[${index}].batchName must be empty for Canonical work`);
  } else if (!SAFE_BATCH_NAME.test(String(submission.batchName || ""))) {
    errors.push(`submissions[${index}].batchName must be a safe queue batch filename`);
  }
  for (const [field, value] of [
    ["requestedPacketBlobSha", submission.requestedPacketBlobSha],
    ["requestedBatchName", submission.requestedBatchName],
    ["requestedScope", submission.requestedScope],
  ]) {
    if (value == null) continue;
    if (field.endsWith("Sha") && value !== submission.packetBlobSha) errors.push(`submissions[${index}].${field} does not match the GitHub-resolved packet blob`);
    if (field === "requestedBatchName" && value !== submission.batchName) errors.push(`submissions[${index}].${field} does not match the GitHub-resolved queue batch`);
    if (field === "requestedScope" && value !== submission.scope) errors.push(`submissions[${index}].${field} does not match the GitHub-resolved packet scope`);
  }
  if (!submission.queueSnapshot || !SHA.test(String(submission.queueSnapshot.stateCommit || "")) || !SHA.test(String(submission.queueSnapshot.queueBlobSha || ""))) {
    errors.push(`submissions[${index}].queueSnapshot must bind a state commit and queue blob SHA`);
  }
  if (submission.requestedEventKeys != null) {
    const requestedKeys = unique(submission.requestedEventKeys || []).sort();
    if (requestedKeys.join("\u0000") !== actualKeys.join("\u0000")) errors.push(`submissions[${index}].requestedEventKeys does not match the GitHub-resolved event identities`);
  }
  return errors;
}

/**
 * Validate a GitHub-resolved, same-edition handoff bundle. The editorial task
 * may request packet identities, but only this plan's resolved Git blob and
 * queue identities authorize execution.
 */
export function validateEditorialBundle(bundle, { branchName, packetTextsBySha = new Map() } = {}) {
  const errors = [];
  if (!bundle || typeof bundle !== "object") return ["editorial bundle must be an object"];
  if (bundle.schemaVersion !== EDITORIAL_BUNDLE_SCHEMA_VERSION) errors.push(`editorial bundle schemaVersion must be ${EDITORIAL_BUNDLE_SCHEMA_VERSION}`);
  if (!/^\d{4}-\d{2}-\d{2}-(?:am|pm|daily)$/u.test(String(bundle.editionId || ""))) errors.push("editorial bundle editionId is invalid");
  if (!Array.isArray(bundle.submissions) || !bundle.submissions.length) return [...errors, "editorial bundle submissions must be a non-empty array"];
  if (bundle.submissions.length > MAX_BUNDLE_SUBMISSIONS) errors.push(`editorial bundle supports at most ${MAX_BUNDLE_SUBMISSIONS} submissions`);
  if (!/^automation\/editorial\/\d{4}-\d{2}-\d{2}-(?:am|pm|daily)$/u.test(String(branchName || ""))) errors.push("editorial bundle branch must be edition-scoped");

  const seenBlobs = new Set();
  const seenEvents = new Set();
  let totalChars = 0;
  let totalInputChars = 0;
  for (const [index, submission] of bundle.submissions.entries()) {
    if (!submission || typeof submission !== "object") {
      errors.push(`submissions[${index}] must be an object`);
      continue;
    }
    if (submission.index !== index) errors.push(`submissions[${index}].index must be ${index}`);
    if (!SHA.test(String(submission.packetBlobSha || ""))) errors.push(`submissions[${index}].packetBlobSha must be a Git blob SHA`);
    if (seenBlobs.has(submission.packetBlobSha)) errors.push(`submissions[${index}] repeats a packet blob`);
    seenBlobs.add(submission.packetBlobSha);
    const packetText = packetTextsBySha.get(submission.packetBlobSha);
    if (typeof packetText !== "string") {
      errors.push(`submissions[${index}] packet blob is not available from the trusted state ref`);
      continue;
    }
    if (gitBlobSha(packetText) !== submission.packetBlobSha) errors.push(`submissions[${index}] packet blob SHA does not match its bytes`);
    let packet;
    try { packet = JSON.parse(packetText); } catch { errors.push(`submissions[${index}] packet blob is not valid JSON`); continue; }
    errors.push(...validateFinalizedEditorialPacket(packet, { editionId: bundle.editionId }).map(error => `submissions[${index}]: ${error}`));
    const editorial = submission.editorial;
    const packetChars = serializedChars(packet, editorial);
    totalChars += packetChars;
    totalInputChars += inputBudget(packet, index, errors);
    if (packetChars > MAX_PACKET_SERIALIZED_CHARS) errors.push(`submissions[${index}] serialized packet/editorial envelope exceeds ${MAX_PACKET_SERIALIZED_CHARS} characters`);
    errors.push(...identityErrors(submission, packet, index));
    if (editorial?.editionId !== bundle.editionId) errors.push(`submissions[${index}].editorial editionId does not match the bundle`);
    const decisionErrors = validateEditorialSubmission({
      branchName: `automation/editorial/${bundle.editionId}`,
      packet,
      editorial,
      packetBlobSha: submission.packetBlobSha,
    });
    errors.push(...decisionErrors.map(error => `submissions[${index}]: ${error}`));
    for (const eventKey of submission.eventKeys || []) {
      if (seenEvents.has(eventKey)) errors.push(`eventKey ${eventKey} appears in more than one bundle submission`);
      seenEvents.add(eventKey);
    }
    if (index > 0 && resolvedScope(packet) === "canonical") errors.push("only the first bundle submission may be normal Canonical work");
    if (index > 0 && resolvedScope(packet) === "news" && bundle.submissions[index - 1]?.scope === "showcase") errors.push("news cannot follow a showcase slot in one bundle");
  }
  if (totalInputChars > MAX_BUNDLE_INPUT_CHARS) errors.push(`editorial bundle editorialInput exceeds ${MAX_BUNDLE_INPUT_CHARS} characters`);
  if (totalChars > MAX_BUNDLE_SERIALIZED_CHARS) errors.push(`editorial bundle serialized input exceeds ${MAX_BUNDLE_SERIALIZED_CHARS} characters`);
  if (bundle.serializedChars != null && Number(bundle.serializedChars) !== totalChars) errors.push("editorial bundle serializedChars does not match the resolved packet/editorial bytes");
  return [...new Set(errors)];
}

export function assertEditorialBundle(bundle, options = {}) {
  const errors = validateEditorialBundle(bundle, options);
  if (errors.length) throw new Error(`Editorial bundle is invalid:\n- ${errors.join("\n- ")}`);
  return bundle;
}

export function bundleSerializedChars(bundle, packetTextsBySha) {
  return (bundle.submissions || []).reduce((total, submission) => {
    const packetText = packetTextsBySha.get(submission.packetBlobSha);
    if (typeof packetText !== "string") throw new Error(`missing packet bytes for ${submission.packetBlobSha}`);
    return total + serializedChars(JSON.parse(packetText), submission.editorial);
  }, 0);
}
