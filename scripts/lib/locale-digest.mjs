import { createHash } from "node:crypto";
import {
  canonicalCopyProjection,
  editorialDecisionProjection,
  factsProjection,
  localeProjection,
  stableJson,
} from "../../src/lib/locale-projection.js";

function sha256(value) {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

export function factsDigest(edition, sharedFactFrameDigests = {}) {
  return sha256(factsProjection(edition, sharedFactFrameDigests));
}

export function canonicalCopyDigest(edition) {
  return sha256(canonicalCopyProjection(edition));
}

export function localeDigest(overlay) {
  return sha256(localeProjection(overlay));
}

export function editorialDecisionDigest(editorial) {
  return sha256(editorialDecisionProjection(editorial)).slice("sha256:".length);
}

export function isDigest(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}
