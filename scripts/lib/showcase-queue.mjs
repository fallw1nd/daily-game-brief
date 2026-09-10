import { applyEditionStateEvent, gitBlobSha } from "./edition-state.mjs";
import { validateFinalizedEditorialPacket } from "./editorial-packet.mjs";

// Called within the existing automation/state Git transaction. A rejected push
// must reload all inputs and recompute, so a manual revision cannot be overwritten.
export function advanceShowcaseQueue({ queue, state, canonical, packets, now = new Date().toISOString() }) {
  if (queue.editionId !== state.editionId || canonical.id !== queue.editionId) throw new Error("showcase queue requires the same current edition");
  const nextQueue = structuredClone(queue);
  const covered = new Set(canonical.entries.flatMap(entry => (entry.showcaseRefs || []).map(ref => ref.announcementId)));
  nextQueue.processedAnnouncements = covered.size;
  nextQueue.remainingAnnouncements = Math.max(0, queue.totalAnnouncements - covered.size);
  for (const batch of nextQueue.batches) {
    if (batch.scope === "showcase" && batch.eventKeys.every(key => covered.has(key))) batch.status = "completed";
  }
  if (state.revisionRequest?.status === "open" || state.publication.status !== "committed") return { queue: nextQueue, state, packet: null };
  const next = nextQueue.batches.find(batch => batch.scope === "showcase" && batch.status === "pending");
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
  next.status = "editing";
  next.activatedAt = now;
  return { queue: nextQueue, state: nextState, packet: packetText };
}
