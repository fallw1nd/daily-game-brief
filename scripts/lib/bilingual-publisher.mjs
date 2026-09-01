import { upcomingKey } from "../../src/lib/locale-projection.js";
import {
  canonicalCopyDigest,
  factsDigest,
  localeDigest,
} from "./locale-digest.mjs";
import { validateEnglishOverlay } from "./locale-overlay.mjs";

export function localeArchivePath(editionId) {
  const [year, month] = editionId.split("-");
  return `locales/en/archive/${year}/${month}/${editionId}.json`;
}

export function localeStatusPath(editionId) {
  const [year, month] = editionId.split("-");
  return `locales/en/status/${year}/${month}/${editionId}.json`;
}

export function deriveEntryIdsByEvent(editorial) {
  const counters = new Map();
  const result = {};
  for (const decision of editorial?.decisions || []) {
    if (decision.decision !== "include") continue;
    const index = counters.get(decision.section) || 0;
    counters.set(decision.section, index + 1);
    result[decision.eventKey] = `${editorial.editionId}-${decision.section}-${index}`;
  }
  return result;
}

function cleanOptional(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSourceLabels(items) {
  return (items || []).map((item) => ({
    sourceIndex: item.sourceIndex,
    label: item.label,
  }));
}

function normalizeMediaAlts(items) {
  return (items || []).map((item) => ({
    assetKey: item.assetKey,
    alt: item.alt,
    ...(cleanOptional(item.creditLabel) ? { creditLabel: cleanOptional(item.creditLabel) } : {}),
  }));
}

function previousUpcomingByIdentity(previousOverlay) {
  return new Map((previousOverlay?.upcoming || []).map((item) => [item.upcomingId ?? item.upcomingKey, item]));
}

function buildUpcomingOverlay(canonical, draft, previousOverlay) {
  const draftById = new Map((draft?.upcoming || []).map((item) => [item.upcomingId, item]));
  const previousById = previousUpcomingByIdentity(previousOverlay);
  return (canonical.upcoming || []).map((item) => {
    const identity = upcomingKey(canonical.id, item);
    const source = draftById.get(item.id) || previousById.get(item.id) || previousById.get(identity) || {};
    return {
      upcomingId: identity,
      ...(cleanOptional(source.regionLabel) ? { regionLabel: cleanOptional(source.regionLabel) } : {}),
      ...(cleanOptional(source.releaseTypeLabel) ? { releaseTypeLabel: cleanOptional(source.releaseTypeLabel) } : {}),
      ...(cleanOptional(source.sourceLabel) ? { sourceLabel: cleanOptional(source.sourceLabel) } : {}),
      ...(cleanOptional(source.coverAlt) ? { coverAlt: cleanOptional(source.coverAlt) } : {}),
    };
  });
}

function finalizeEnglishOverlay(canonical, presentation) {
  const overlay = {
    schemaVersion: 1,
    locale: "en",
    editionId: canonical.id,
    baseSchemaVersion: canonical.schemaVersion ?? 1,
    factsDigest: factsDigest(canonical),
    canonicalCopyDigest: canonicalCopyDigest(canonical),
    localeDigest: `sha256:${"0".repeat(64)}`,
    archiveTitle: presentation.archiveTitle,
    entries: presentation.entries,
    upcoming: presentation.upcoming,
    ...(presentation.sourceReport ? { sourceReport: presentation.sourceReport } : {}),
  };
  overlay.localeDigest = localeDigest(overlay);
  const validation = validateEnglishOverlay(canonical, overlay);
  if (!validation.valid) {
    return {
      status: "unavailable",
      reasonCode: "editorial-overlay-invalid",
      summary: validation.summary,
      overlay: null,
      warnings: validation.warnings,
      errors: validation.errors,
    };
  }
  return {
    status: "available",
    reasonCode: null,
    summary: "English overlay is valid.",
    overlay,
    warnings: validation.warnings,
    errors: [],
  };
}

export function buildEnglishOverlay({ canonical, editorial, entryIdsByEvent, previousOverlay = null }) {
  const draft = editorial?.locales?.en;
  if (!draft) {
    return {
      status: "unavailable",
      reasonCode: "editorial-overlay-missing",
      summary: "English version is temporarily unavailable because the editorial submission did not include a complete English presentation draft.",
      overlay: null,
      warnings: [],
    };
  }
  const ids = entryIdsByEvent || deriveEntryIdsByEvent(editorial);
  const entries = (draft.entries || []).map((item) => ({
    entryId: ids[item.eventKey],
    headline: item.headline,
    summary: item.summary,
    verification: item.verification,
    timeNote: item.timeNote,
    ...(cleanOptional(item.regionLabel) ? { regionLabel: cleanOptional(item.regionLabel) } : {}),
    ...(cleanOptional(item.releaseTypeLabel) ? { releaseTypeLabel: cleanOptional(item.releaseTypeLabel) } : {}),
    ...(Array.isArray(item.sourceLabels) && item.sourceLabels.length
      ? { sourceLabels: normalizeSourceLabels(item.sourceLabels) }
      : {}),
  }));
  return finalizeEnglishOverlay(canonical, {
    archiveTitle: draft.archiveTitle,
    entries,
    upcoming: buildUpcomingOverlay(canonical, draft, previousOverlay),
    sourceReport: draft.sourceReport,
  });
}

export function buildEnglishRepairOverlay({ canonical, draft }) {
  if (!draft || draft.schemaVersion !== 1 || draft.locale !== "en" || draft.editionId !== canonical?.id) {
    return {
      status: "unavailable",
      reasonCode: "locale-repair-invalid",
      summary: "English locale repair draft must use schemaVersion=1, locale=en, and the exact Canonical editionId.",
      overlay: null,
      warnings: [],
      errors: ["locale repair identity does not match Canonical edition"],
    };
  }
  const entries = (draft.entries || []).map((item) => ({
    entryId: item.entryId,
    headline: item.headline,
    summary: item.summary,
    verification: item.verification,
    timeNote: item.timeNote,
    ...(cleanOptional(item.regionLabel) ? { regionLabel: cleanOptional(item.regionLabel) } : {}),
    ...(cleanOptional(item.releaseTypeLabel) ? { releaseTypeLabel: cleanOptional(item.releaseTypeLabel) } : {}),
    ...(Array.isArray(item.sourceLabels) && item.sourceLabels.length
      ? { sourceLabels: normalizeSourceLabels(item.sourceLabels) }
      : {}),
    ...(Array.isArray(item.mediaAlts) && item.mediaAlts.length
      ? { mediaAlts: normalizeMediaAlts(item.mediaAlts) }
      : {}),
  }));
  const upcoming = (draft.upcoming || []).map((item) => ({
    upcomingId: item.upcomingId,
    ...(cleanOptional(item.regionLabel) ? { regionLabel: cleanOptional(item.regionLabel) } : {}),
    ...(cleanOptional(item.releaseTypeLabel) ? { releaseTypeLabel: cleanOptional(item.releaseTypeLabel) } : {}),
    ...(cleanOptional(item.sourceLabel) ? { sourceLabel: cleanOptional(item.sourceLabel) } : {}),
    ...(cleanOptional(item.coverAlt) ? { coverAlt: cleanOptional(item.coverAlt) } : {}),
  }));
  const result = finalizeEnglishOverlay(canonical, {
    archiveTitle: draft.archiveTitle,
    entries,
    upcoming,
    sourceReport: draft.sourceReport,
  });
  if (result.status !== "available") {
    return {
      ...result,
      reasonCode: "locale-repair-invalid",
    };
  }
  return result;
}

export function buildLocaleUnavailableStatus({ canonical, reasonCode, summary, observedAt }) {
  return {
    schemaVersion: 1,
    locale: "en",
    editionId: canonical.id,
    factsDigest: factsDigest(canonical),
    reasonCode,
    summary,
    observedAt: observedAt || canonical.generatedAt,
  };
}
