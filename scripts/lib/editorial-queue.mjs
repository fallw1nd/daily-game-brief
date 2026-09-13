import {
  applyEditionStateEvent,
  EDITORIAL_CONTINUATION_REASON,
  gitBlobSha,
  SHOWCASE_COMPLETION_REASON,
} from "./edition-state.mjs";
import { validateFinalizedEditorialPacket } from "./editorial-packet.mjs";
import { mergeShowcaseRefs, showcaseRetryDue } from "./showcase.mjs";

const SAFE_BATCH_NAME = /^[\w-]+\.json$/u;

function unique(values) {
  return [...new Set(values)];
}

function assertBatchShape(batch) {
  if (!batch || !["news", "showcase"].includes(batch.scope)) throw new Error("editorial queue contains an unsupported batch scope");
  if (!SAFE_BATCH_NAME.test(String(batch.name || ""))) throw new Error("editorial queue contains an unsafe batch filename");
  if (!Array.isArray(batch.eventKeys) || !batch.eventKeys.length || batch.eventKeys.some(key => typeof key !== "string" || !key)) {
    throw new Error(`editorial batch ${batch.name} requires event identities`);
  }
  if (!new Set(["pending", "editing", "awaiting_retry", "completed"]).has(batch.status)) {
    throw new Error(`editorial batch ${batch.name} has an invalid status`);
  }
}

function validateBatchPacket(packetText, batch, editionId) {
  let packet;
  try { packet = JSON.parse(packetText); } catch { throw new Error(`editorial batch ${batch.name} is not valid JSON`); }
  const errors = validateFinalizedEditorialPacket(packet, { editionId });
  if (errors.length) throw new Error(errors.join("; "));
  if (packet.continuation?.scope !== batch.scope || packet.continuation?.preservePublished !== true) {
    throw new Error(`editorial batch ${batch.name} has an invalid continuation scope`);
  }
  const packages = packet.editorialInput?.packages || [];
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

function showcaseCoverage(queue, canonical) {
  const known = new Set(queue.requiredFacts ? Object.keys(queue.requiredFacts) : queue.batches
    .filter(batch => batch.scope === "showcase")
    .flatMap(batch => batch.eventKeys));
  return new Set(mergeShowcaseRefs((canonical.entries || []).flatMap(entry => entry.showcaseRefs || []))
    .filter(ref => known.has(ref.announcementId)
      && (queue.requiredFacts?.[ref.announcementId] || []).every(id => ref.factIds?.includes(id)))
    .map(ref => ref.announcementId));
}

function nextBatch(queue, nowMs) {
  // News gets the first continuation turn, then a pending showcase gets the
  // next turn when one exists. This keeps Canonical progress ahead of a
  // showcase without allowing a sustained news backlog to starve it.
  const newsFirst = Number(queue.newsSinceShowcase || 0) < 1;
  const pendingNews = queue.batches.find(batch => batch.scope === "news" && batch.status === "pending");
  const pendingShowcase = queue.batches.find(batch => batch.scope === "showcase" && batch.status === "pending");
  const pending = newsFirst
    ? pendingNews || pendingShowcase
    : pendingShowcase || pendingNews;
  if (pending) return pending;
  const dueNews = queue.batches.find(batch => batch.scope === "news" && batch.status === "awaiting_retry" && showcaseRetryDue(
    queue.firstPublishedAt,
    batch.retryAttempts || 0,
    nowMs,
  ));
  const dueShowcase = queue.batches.find(batch => batch.scope === "showcase" && batch.status === "awaiting_retry" && showcaseRetryDue(
    queue.firstPublishedAt,
    batch.retryAttempts || 0,
    nowMs,
  ));
  return newsFirst ? dueNews || dueShowcase : dueShowcase || dueNews;
}

/**
 * Advance exactly one durable editorial continuation for an already published
 * edition. News continuations use their own trusted state reason and exact
 * event-key scope; showcase continuations retain the narrower announcement
 * identity/fact checks. The caller persists the returned state and packet in
 * the same automation/state transaction.
 */
export function advanceEditorialQueue({ queue, state, canonical, packets, now = new Date().toISOString() }) {
  if (queue.editionId !== state.editionId || canonical.id !== queue.editionId) {
    throw new Error("editorial queue requires the same current edition");
  }
  if (!Array.isArray(queue.batches)) throw new Error("editorial queue batches are required");
  queue.batches.forEach(assertBatchShape);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("editorial queue now must be a valid timestamp");

  const nextQueue = structuredClone(queue);
  const covered = showcaseCoverage(queue, canonical);
  nextQueue.processedAnnouncements = covered.size;
  nextQueue.remainingAnnouncements = Math.max(0, Number(queue.totalAnnouncements || 0) - covered.size);
  if (!nextQueue.firstPublishedAt && state.publication.status === "committed") {
    nextQueue.firstPublishedAt = state.publication.updatedAt;
  }

  for (const batch of nextQueue.batches) {
    if (batch.scope === "showcase" && batch.eventKeys.every(key => covered.has(key))) {
      batch.status = "completed";
      continue;
    }
    if (batch.status !== "editing" || state.revisionRequest?.status === "open" || state.publication.status !== "committed") continue;
    if (batch.scope === "news") {
      if (state.revisionRequest?.reason !== EDITORIAL_CONTINUATION_REASON || state.revisionRequest.batchName !== batch.name) {
        throw new Error(`news batch ${batch.name} was not completed by its scoped continuation publication`);
      }
      batch.status = "completed";
    } else {
      batch.status = "awaiting_retry";
    }
  }

  if (state.revisionRequest?.status === "open" || state.publication.status !== "committed") {
    return { queue: nextQueue, state, packet: null, batch: null };
  }
  const batch = nextBatch(nextQueue, nowMs);
  if (!batch) return { queue: nextQueue, state, packet: null, batch: null };
  const packetText = packets?.[batch.name];
  if (typeof packetText !== "string") throw new Error(`missing durable editorial batch: ${batch.name}`);
  validateBatchPacket(packetText, batch, queue.editionId);

  let nextState;
  if (batch.scope === "showcase") {
    const packet = JSON.parse(packetText);
    const announcementIds = unique(packet.editorialInput.packages.flatMap(item => item.showcaseRefs.map(ref => ref.announcementId)));
    nextState = applyEditionStateEvent(state, "supplement-opened", {
      reason: SHOWCASE_COMPLETION_REASON,
      announcementIds,
      at: now,
    });
  } else {
    nextState = applyEditionStateEvent(state, "continuation-opened", {
      reason: EDITORIAL_CONTINUATION_REASON,
      batchName: batch.name,
      batchScope: batch.scope,
      eventKeys: batch.eventKeys,
      at: now,
    });
  }
  nextQueue.newsSinceShowcase = batch.scope === "showcase"
    ? 0
    : Math.min(1, Number(nextQueue.newsSinceShowcase || 0) + 1);
  nextState = applyEditionStateEvent(nextState, "packet-ready", {
    packetBlobSha: gitBlobSha(packetText),
    at: now,
  });
  if (batch.status === "awaiting_retry") batch.retryAttempts = (batch.retryAttempts || 0) + 1;
  batch.status = "editing";
  batch.activatedAt = now;
  nextQueue.activeBatchName = batch.name;
  return { queue: nextQueue, state: nextState, packet: packetText, batch };
}

/** Backwards-compatible showcase-only helper for focused callers/tests. */
export function advanceShowcaseQueue(input) {
  const queue = structuredClone(input.queue);
  queue.batches = queue.batches.filter(batch => batch.scope === "showcase");
  return advanceEditorialQueue({ ...input, queue });
}
