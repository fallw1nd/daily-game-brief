// State authorization runs before npm ci. Keep this module and its imports
// dependency-free; discovery/parsing dependencies belong to the normal queue.
import { applyEditionStateEvent, EDITORIAL_CONTINUATION_REASON, gitBlobSha } from "./edition-state.mjs";
import { validateFinalizedEditorialPacket } from "./editorial-packet.mjs";

const SAFE_BATCH_NAME = /^[\w-]+\.json$/u;
const unique = values => [...new Set(values)];

export function assertBatchShape(batch) {
  if (!batch || !["news", "showcase", "calendar"].includes(batch.scope)) throw new Error("editorial queue contains an unsupported batch scope");
  if (!SAFE_BATCH_NAME.test(String(batch.name || ""))) throw new Error("editorial queue contains an unsafe batch filename");
  if (!Array.isArray(batch.eventKeys) || !batch.eventKeys.length || batch.eventKeys.some(key => typeof key !== "string" || !key)) {
    throw new Error(`editorial batch ${batch.name} requires event identities`);
  }
  if (!new Set(["pending", "editing", "awaiting_retry", "completed"]).has(batch.status)) {
    throw new Error(`editorial batch ${batch.name} has an invalid status`);
  }
}

export function validateBatchPacket(packetText, batch, editionId) {
  let packet;
  try { packet = JSON.parse(packetText); } catch { throw new Error(`editorial batch ${batch.name} is not valid JSON`); }
  const errors = validateFinalizedEditorialPacket(packet, { editionId });
  if (errors.length) throw new Error(errors.join("; "));
  if (packet.continuation?.scope !== batch.scope || packet.continuation?.preservePublished !== true) {
    throw new Error(`editorial batch ${batch.name} has an invalid continuation scope`);
  }
  const packages = packet.editorialInput?.packages || [];
  if (batch.scope === "calendar") {
    const keys = packet.editorialInput?.calendarWork?.pages?.map(page => page.blobSha) || [];
    if (packages.length || packet.editorialInput?.trackingQueue?.length || !keys.length
      || keys.some(key => !/^[0-9a-f]{40}$/.test(key)) || new Set(keys).size !== keys.length
      || [...keys].sort().join("\0") !== [...batch.eventKeys].sort().join("\0")) {
      throw new Error(`calendar batch ${batch.name} must contain only its pinned calendar page identities`);
    }
    return packet;
  }
  if (!packages.length) throw new Error(`editorial batch ${batch.name} must contain at least one package`);
  const packageKeys = packages.map(item => item.eventKey);
  if (packageKeys.some(key => typeof key !== "string" || !key) || new Set(packageKeys).size !== packageKeys.length) {
    throw new Error(`editorial batch ${batch.name} contains duplicate or missing event identities`);
  }
  if (batch.scope === "news") {
    const expected = unique(batch.eventKeys).sort().join("\u0000");
    const actual = unique(packageKeys).sort().join("\u0000");
    if (expected !== actual) throw new Error(`news batch ${batch.name} event identities do not match its durable queue entry`);
    if (packages.some(item => item.showcaseRefs?.length)) throw new Error(`news batch ${batch.name} cannot contain showcase references`);
  } else {
    const announcementIds = packages.flatMap(item => {
      if (!item.showcaseRefs?.length) throw new Error(`showcase batch ${batch.name} contains an ordinary news package`);
      return item.showcaseRefs.map(ref => ref.announcementId);
    });
    if (!announcementIds.length || announcementIds.some(id => !batch.eventKeys.includes(id))) {
      throw new Error(`showcase batch ${batch.name} contains an out-of-scope announcement`);
    }
  }
  return packet;
}

/** Return an unconsumed continuation to its existing queue before manual work.
 * Persist both outputs atomically; never infer completion from the takeover. */
export function openManualRevision({ state, queue, packets, ...data }) {
  const nextState = applyEditionStateEvent(state, "revision-opened", data);
  const request = state?.revisionRequest;
  if (request?.status !== "open" || request.reason !== EDITORIAL_CONTINUATION_REASON) {
    return { state: nextState, queue };
  }
  if (queue?.editionId !== state.editionId || !Array.isArray(queue.batches)
    || queue.activeBatchName !== request.batchName) throw new Error("manual takeover requires the exact active continuation queue");
  queue.batches.forEach(assertBatchShape);
  const matches = queue.batches.filter(batch => batch.name === request.batchName);
  const batch = matches[0];
  if (matches.length !== 1 || batch.status !== "editing" || batch.scope !== request.batchScope
    || queue.batches.some(other => other !== batch && other.status === "editing")
    || [...batch.eventKeys].sort().join("\0") !== [...request.eventKeys].sort().join("\0")) {
    throw new Error("manual takeover requires the exact unconsumed continuation batch");
  }
  const packetText = packets?.[batch.name];
  if (typeof packetText !== "string") throw new Error("manual takeover requires the durable continuation packet");
  validateBatchPacket(packetText, batch, state.editionId);
  if (state.packet.status === "ready" && gitBlobSha(packetText) !== state.packet.blobSha) {
    throw new Error("manual takeover continuation packet does not match durable acknowledgement");
  }
  const nextQueue = structuredClone(queue);
  nextQueue.batches.find(item => item.name === batch.name).status = "pending";
  nextQueue.activeBatchName = null;
  return { state: nextState, queue: nextQueue };
}
