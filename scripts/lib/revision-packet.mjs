import { validateFinalizedEditorialPacket } from "./editorial-packet.mjs";

const SUBJECT_KINDS = new Set(["game", "entity", "topic"]);

function normalizedSubjectOverride(eventKey, raw) {
  const value = typeof raw === "string" ? { key: raw } : raw;
  if (!value || typeof value !== "object") throw new Error(`Invalid subject identity override for ${eventKey}`);
  const key = String(value.key || "").trim();
  if (!key || key.length > 200 || /[\u0000-\u001f\u007f]/u.test(key)) {
    throw new Error(`Invalid subject identity key for ${eventKey}`);
  }
  const kind = value.kind == null ? null : String(value.kind);
  if (kind != null && !SUBJECT_KINDS.has(kind)) throw new Error(`Invalid subject identity kind for ${eventKey}`);
  return { key, kind };
}

/**
 * A historical revision may repair only the subject identity on candidates
 * whose original acknowledged packet explicitly left identity unresolved.
 * Evidence, timing, headline, score, and source bytes remain untouched.
 */
export function applyRevisionSubjectIdentityOverrides(packet, wake) {
  const raw = wake?.subjectIdentityOverrides;
  if (raw == null) return packet;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("subjectIdentityOverrides must be an eventKey object");
  }
  const entries = Object.entries(raw);
  if (!entries.length) return packet;
  if (entries.length > 100) throw new Error("subjectIdentityOverrides exceeds 100 entries");

  const next = structuredClone(packet);
  const packages = new Map((next.editorialInput?.packages || []).map(item => [item.eventKey, item]));
  for (const [eventKey, rawOverride] of entries) {
    const item = packages.get(eventKey);
    if (!item) throw new Error(`Subject identity override references unknown event ${eventKey}`);
    if (item.publishability !== "requires_subject_identity" || item.subjectKey) {
      throw new Error(`Subject identity override is only allowed for unresolved candidates: ${eventKey}`);
    }
    if (!(item.sources || []).some(source => source.status === "opened")) {
      throw new Error(`Subject identity override requires opened evidence: ${eventKey}`);
    }
    const override = normalizedSubjectOverride(eventKey, rawOverride);
    const kind = override.kind || (item.eventKind === "company" ? "entity" : "game");
    item.subjectKey = override.key;
    item.subject = { kind, key: override.key };
    item.publishability = "direct";
  }
  return next;
}

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
