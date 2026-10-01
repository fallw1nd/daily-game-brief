export const HISTORICAL_INSERTION_REASON = "user_authorized_historical_missing_insertion";

export function assertHistoricalIdentity({ manifest, editionId, insertion, allowExisting = false }) {
  if (!/^\d{4}-\d{2}-\d{2}-daily$/.test(editionId || "")) throw new Error("historical insertion requires a Daily edition");
  if (!insertion || !Number.isInteger(insertion.issueNumber) || insertion.issueNumber < 1) throw new Error("historical insertion requires an explicit positive issue number");
  if (manifest.latest !== insertion.latestEditionId || !manifest.editions.some(item => item.id === manifest.latest)) throw new Error("historical insertion latest identity changed");
  if (!manifest.editions.some(item => item.id.slice(0, 10) > editionId.slice(0, 10))) throw new Error("historical insertion requires later published Canonical editions");
  const existing = manifest.editions.find(item => item.id === editionId);
  if (existing) {
    if (!allowExisting || existing.issueNumber !== insertion.issueNumber) throw new Error("historical insertion target already exists or has a different issue");
  } else if (insertion.issueNumber !== Math.max(0, ...manifest.editions.map(item => item.issueNumber)) + 1) {
    throw new Error("historical insertion next issue changed; do not renumber published editions");
  }
  return existing || null;
}

export function assertHistoricalInsertion({ manifest, editionId, insertion, state, packetBlobSha, phase = "request" }) {
  const existing = assertHistoricalIdentity({ manifest, editionId, insertion, allowExisting: phase === "publication" });
  if (state?.editionId !== editionId || state.packet?.status !== "ready" || state.packet.blobSha !== packetBlobSha) throw new Error("historical insertion is not bound to the acknowledged packet");
  const acknowledged = state.editorial?.packetBlobSha === packetBlobSha && state.transitions?.some(event =>
    event.event === "editorial-submitted" && event.reason === HISTORICAL_INSERTION_REASON &&
    event.packetBlobSha === packetBlobSha && event.submissionSha === state.editorial.submissionSha);
  if (phase === "publication") {
    if (!acknowledged || state.editorial?.status !== "valid") throw new Error("historical insertion requires its validated authorized submission");
  } else if (!(state.editorial?.status === "timed_out" && state.publication?.status === "failed") &&
    !(acknowledged && ["submitted", "valid", "invalid"].includes(state.editorial?.status) && state.publication?.status === "failed")) {
    throw new Error("historical insertion requires failed publication after editorial timeout");
  }
  return existing;
}
