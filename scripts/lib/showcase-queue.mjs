import { applyEditionStateEvent, gitBlobSha } from "./edition-state.mjs";
import { validateFinalizedEditorialPacket } from "./editorial-packet.mjs";
import { showcaseRetryDue, mergeShowcaseRefs } from "./showcase.mjs";

// Called within the existing automation/state Git transaction. A rejected push
// must reload all inputs and recompute, so a manual revision cannot be overwritten.
export function advanceShowcaseQueue({ queue, state, canonical, packets, now = new Date().toISOString() }) {
  if (queue.editionId !== state.editionId || canonical.id !== queue.editionId) throw new Error("showcase queue requires the same current edition");
  const nextQueue = structuredClone(queue);
  const known = new Set(queue.requiredFacts ? Object.keys(queue.requiredFacts) : queue.batches.filter(batch => batch.scope === "showcase").flatMap(batch => batch.eventKeys));
  const covered = new Set(mergeShowcaseRefs(canonical.entries.flatMap(entry => entry.showcaseRefs || [])).filter(ref => known.has(ref.announcementId) && (queue.requiredFacts?.[ref.announcementId] || []).every(id => ref.factIds?.includes(id))).map(ref => ref.announcementId));
  if (!nextQueue.firstPublishedAt && state.publication.status === "committed") nextQueue.firstPublishedAt = state.publication.updatedAt;
  nextQueue.processedAnnouncements = covered.size;
  nextQueue.remainingAnnouncements = Math.max(0, queue.totalAnnouncements - covered.size);
  for (const batch of nextQueue.batches) {
    if (batch.scope === "showcase" && batch.eventKeys.every(key => covered.has(key))) batch.status = "completed";
    else if (batch.status === "editing" && state.revisionRequest?.status !== "open" && state.publication.status === "committed") batch.status = "awaiting_retry";
  }
  if (state.revisionRequest?.status === "open" || state.publication.status !== "committed") return { queue: nextQueue, state, packet: null };
  const next = nextQueue.batches.find(batch => batch.scope === "showcase" && batch.status === "pending") || nextQueue.batches.find(batch => batch.scope === "showcase" && batch.status === "awaiting_retry" && showcaseRetryDue(nextQueue.firstPublishedAt, batch.retryAttempts || 0, Date.parse(now)));
  if (!next) return { queue: nextQueue, state, packet: null };
  const packetText = packets[next.name];
  if (!packetText) throw new Error(`missing durable showcase packet: ${next.name}`);
  const packet = JSON.parse(packetText);
  const errors = validateFinalizedEditorialPacket(packet, { editionId: queue.editionId });
  if (errors.length) throw new Error(errors.join("; "));
  if (packet.continuation?.scope !== "showcase" || packet.continuation?.preservePublished !== true) throw new Error("invalid showcase continuation scope");
  const ids = packet.editorialInput.packages.flatMap(item => {
    if (!item.showcaseRefs?.length) throw new Error("showcase continuation contains ordinary news");
    return item.showcaseRefs.map(ref => ref.announcementId);
  });
  if (!ids.length || ids.some(id => !next.eventKeys.includes(id))) throw new Error("queued announcement identity mismatch");
  let nextState = applyEditionStateEvent(state, "supplement-opened", { reason: "showcase_completion", announcementIds: ids, at: now });
  nextState = applyEditionStateEvent(nextState, "packet-ready", { packetBlobSha: gitBlobSha(packetText), at: now });
  if (next.status === "awaiting_retry") next.retryAttempts = (next.retryAttempts || 0) + 1;
  next.status = "editing";
  next.activatedAt = now;
  return { queue: nextQueue, state: nextState, packet: packetText };
}
