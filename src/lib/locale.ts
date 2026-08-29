import type { BriefEdition, EnglishEntryOverlay, EnglishLocaleOverlay, EnglishUpcomingOverlay } from "../types";
import { factsProjection, stableJson } from "./locale-projection.js";
import { programmaticRegionLabel, programmaticReleaseTypeLabel, programmaticSourceLabel } from "./locale-dictionary.js";

export type EnglishRenderState =
  | { status: "available"; warning?: string }
  | { status: "stale"; message: string }
  | { status: "invalid"; message: string };

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function validateEnglishOverlayForRender(
  canonical: BriefEdition,
  overlay: EnglishLocaleOverlay,
): Promise<EnglishRenderState> {
  if (overlay.locale !== "en" || overlay.editionId !== canonical.id || overlay.baseSchemaVersion !== (canonical.schemaVersion ?? 1)) {
    return { status: "invalid", message: "English version is temporarily unavailable for this edition." };
  }
  const digest = await sha256(factsProjection(canonical));
  if (digest !== overlay.factsDigest) {
    return { status: "stale", message: "English version is temporarily unavailable for this edition." };
  }
  if (overlay.entries.length !== canonical.entries.length || overlay.entries.some((item, index) => item.entryId !== canonical.entries[index]?.id)) {
    return { status: "invalid", message: "English version is temporarily unavailable for this edition." };
  }
  if (overlay.upcoming.length !== canonical.upcoming.length) {
    return { status: "invalid", message: "English version is temporarily unavailable for this edition." };
  }
  return { status: "available" };
}

export function resolveEnglishEntryLabels(
  canonical: BriefEdition["entries"][number],
  overlay: EnglishEntryOverlay,
) {
  const sourceLabels = new Map((overlay.sourceLabels ?? []).map((item) => [item.sourceIndex, item.label]));
  const regionLabel = overlay.regionLabel ?? programmaticRegionLabel(canonical.region);
  const releaseTypeLabel = overlay.releaseTypeLabel ?? programmaticReleaseTypeLabel(canonical.releaseType);
  const sources = canonical.sources.map((source, sourceIndex) => ({
    ...source,
    displayLabel: sourceLabels.get(sourceIndex) ?? programmaticSourceLabel(source.label),
  }));
  if (!regionLabel || releaseTypeLabel === null || sources.some((source) => !source.displayLabel)) return null;
  return { regionLabel, releaseTypeLabel, sources };
}

export function resolveEnglishUpcomingLabels(
  canonical: BriefEdition["upcoming"][number],
  overlay: EnglishUpcomingOverlay,
) {
  const regionLabel = overlay.regionLabel ?? programmaticRegionLabel(canonical.region);
  const releaseTypeLabel = overlay.releaseTypeLabel ?? programmaticReleaseTypeLabel(canonical.releaseType);
  const sourceLabel = overlay.sourceLabel ?? programmaticSourceLabel(canonical.source.label);
  if (!regionLabel || releaseTypeLabel === null || !sourceLabel) return null;
  return { regionLabel, releaseTypeLabel, sourceLabel };
}
