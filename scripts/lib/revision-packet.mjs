import { validateFinalizedEditorialPacket } from "./editorial-packet.mjs";

export function validateRevisionPacket(state, wake, packet) {
  const sha = wake.packetBlobSha;
  if (!/^[0-9a-f]{40}$/.test(sha || "")) throw new Error("Invalid revision packet SHA");
  if (wake.reason !== "user_authorized_same_edition_revision" ||
      state.editionId !== wake.editionId || state.revisionRequest?.status !== "open" ||
      state.revisionRequest.reason !== wake.reason || state.editorial?.status !== "pending") {
    throw new Error("Pinned packet requires an unconsumed authorized revision");
  }
  if (!state.transitions?.some(event => event.event === "packet-ready" && event.packetBlobSha === sha)) {
    throw new Error("Packet was never acknowledged for this edition");
  }
  const errors = validateFinalizedEditorialPacket(packet, { editionId: wake.editionId, period: wake.period });
  if (errors.length) throw new Error(errors.join("; "));
  return sha;
}
