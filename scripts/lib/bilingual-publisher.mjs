import { sameCalendarRelease } from "./published-calendar-identity.mjs";
import { normalizeSubjectHeadline } from "./headline-subject.mjs";
import { programmaticRegionLabel, programmaticReleaseTypeLabel } from "../../src/lib/locale-dictionary.js";
import { upcomingKey } from "../../src/lib/locale-projection.js";
import {
  canonicalCopyDigest,
  factsDigest,
  isDigest,
  localeDigest,
} from "./locale-digest.mjs";
import { validateEnglishOverlay } from "./locale-overlay.mjs";
import { mergeEnglishNewsSourceReport } from "./continuation-source-report.mjs";

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

function buildUpcomingOverlay(canonical, draft, previousOverlay, editorial) {
  const draftById = new Map((draft?.upcoming || []).map((item) => [item.upcomingId, item]));
  const previousById = previousUpcomingByIdentity(previousOverlay);
  return (canonical.upcoming || []).map((item) => {
    const identity = upcomingKey(canonical.id, item);
    const aliases = (editorial?.upcoming || []).filter(candidate => sameCalendarRelease(item, candidate, canonical.id.slice(0, 10))
      && candidate.platforms?.some(platform => item.platforms?.includes(platform)));
    const aliasDraft = aliases.length === 1 ? draftById.get(aliases[0].id) : null;
    const source = draftById.get(item.id) || aliasDraft || previousById.get(item.id) || previousById.get(identity) || {};
    const submitted = (editorial?.upcoming || []).find(candidate => candidate.id === item.id)
      || (aliasDraft ? aliases[0] : null);
    const sameScope = !submitted || (submitted.releaseType === item.releaseType
      && JSON.stringify([...new Set(submitted.platforms || [])].sort()) === JSON.stringify([...new Set(item.platforms || [])].sort()));
    // An overlapping alias can supply names/alt text, but its narrower launch
    // label cannot describe the retained broader Canonical platform coverage.
    const releaseTypeLabel = programmaticReleaseTypeLabel(item.releaseType) || (sameScope ? source.releaseTypeLabel : undefined);
    return {
      upcomingId: identity,
      ...(cleanOptional(source.regionLabel) ? { regionLabel: cleanOptional(source.regionLabel) } : {}),
      ...(cleanOptional(releaseTypeLabel) ? { releaseTypeLabel: cleanOptional(releaseTypeLabel) } : {}),
      ...(cleanOptional(source.sourceLabel) ? { sourceLabel: cleanOptional(source.sourceLabel) } : {}),
      ...(cleanOptional(source.coverAlt) ? { coverAlt: cleanOptional(source.coverAlt) } : {}),
    };
  });
}

function finalizeEnglishOverlay(canonical, presentation, boundFactsDigest = factsDigest(canonical), { preserveValidatedPresentation = false } = {}) {
  const overlay = {
    schemaVersion: 1,
    locale: "en",
    editionId: canonical.id,
    baseSchemaVersion: canonical.schemaVersion ?? 1,
    factsDigest: boundFactsDigest,
    canonicalCopyDigest: canonicalCopyDigest(canonical),
    localeDigest: `sha256:${"0".repeat(64)}`,
    archiveTitle: !preserveValidatedPresentation && canonical.entries.length ? normalizeSubjectHeadline(presentation.archiveTitle, canonical.entries.find(entry => entry.id === canonical.leadEntryId)?.title || canonical.entries[0]?.title, { locale: "en", archive: true }) : presentation.archiveTitle,
    entries: presentation.entries.map(item => {
      const entry = canonical.entries.find(entry => entry.id === item.entryId);
      return entry && !preserveValidatedPresentation ? {
        ...item,
        headline: normalizeSubjectHeadline(item.headline, entry.title, { locale: "en" }),
        ...(item.regionLabel === entry.region && programmaticRegionLabel(entry.region) ? { regionLabel: programmaticRegionLabel(entry.region) } : {}),
        ...(item.releaseTypeLabel === entry.releaseType && programmaticReleaseTypeLabel(entry.releaseType) ? { releaseTypeLabel: programmaticReleaseTypeLabel(entry.releaseType) } : {}),
      } : item;
    }),
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

export function buildEnglishOverlay({ canonical, editorial, entryIdsByEvent, previousOverlay = null, previousCanonical = null, preservePublished = false, preserveNewsSourceReport = false }) {
  const draft = editorial?.locales?.en;
  if (!draft) {
    if (preservePublished && previousOverlay?.editionId === canonical.id
      && canonical.entries.every(entry => previousOverlay.entries?.some(item => item.entryId === entry.id))) {
      return finalizeEnglishOverlay(canonical, {
        ...previousOverlay,
        upcoming: buildUpcomingOverlay(canonical, null, previousOverlay, editorial),
      });
    }
    return {
      status: "unavailable",
      reasonCode: "editorial-overlay-missing",
      summary: "English version is temporarily unavailable because the editorial submission did not include a complete English presentation draft.",
      overlay: null,
      warnings: [],
    };
  }
  const ids = entryIdsByEvent || deriveEntryIdsByEvent(editorial);
  const canonicalOrder = new Map((canonical.entries || []).map((entry, index) => [entry.id, index]));
  let entries = (draft.entries || []).map((item) => ({
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
  })).sort((left, right) => {
    const leftIndex = canonicalOrder.get(left.entryId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = canonicalOrder.get(right.entryId) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
  if (preservePublished && previousOverlay?.editionId === canonical.id) {
    const retained = new Map(entries.map(item => [item.entryId, item]));
    for (const item of previousOverlay.entries || []) {
      if (canonicalOrder.has(item.entryId)) retained.set(item.entryId, item);
    }
    entries = [...retained.values()].sort((left, right) => canonicalOrder.get(left.entryId) - canonicalOrder.get(right.entryId));
  }
  return finalizeEnglishOverlay(canonical, {
    archiveTitle: preservePublished && previousOverlay?.editionId === canonical.id ? previousOverlay.archiveTitle : draft.archiveTitle,
    entries,
    upcoming: buildUpcomingOverlay(canonical, draft, previousOverlay, editorial),
    sourceReport: preserveNewsSourceReport && preservePublished && previousCanonical?.id === canonical.id
      && previousOverlay?.editionId === canonical.id && validateEnglishOverlay(previousCanonical, previousOverlay).valid
      ? mergeEnglishNewsSourceReport(previousOverlay.sourceReport, draft.sourceReport) : draft.sourceReport,
  });
}

// A manual overlay can target one story while the archive also contains later
// continuations absent from its original packet. Retain only already-validated,
// byte-unchanged Canonical rows; changed rows still require a fresh English draft.
export function buildManualRevisionEnglishOverlay({ canonical, previousCanonical, previousOverlay, editorial, entryIdsByEvent }) {
  if (previousCanonical?.id !== canonical.id || previousOverlay?.editionId !== canonical.id
    || ["issueNumber", "date", "period", "windowStart", "windowEnd", "timezone"].some(key => previousCanonical[key] !== canonical[key])
    || !validateEnglishOverlay(previousCanonical, previousOverlay).valid) {
    // A complete fresh draft remains valid even when there is nothing safe to
    // retain. Never supply the invalid/mismatched baseline to this fallback.
    return buildEnglishOverlay({ canonical, editorial, entryIdsByEvent });
  }
  const unchanged = (item, oldItems) => oldItems.some(old => old.id === item.id && JSON.stringify(old) === JSON.stringify(item));
  const retainedEntryIds = new Set(canonical.entries.filter(item => unchanged(item, previousCanonical.entries)).map(item => item.id));
  const retainedUpcomingIds = new Set((canonical.upcoming || []).filter(item => unchanged(item, previousCanonical.upcoming || [])).map(item => upcomingKey(canonical.id, item)));
  const retained = {
    ...previousOverlay,
    entries: previousOverlay.entries.filter(item => retainedEntryIds.has(item.entryId)),
    upcoming: previousOverlay.upcoming.filter(item => retainedUpcomingIds.has(item.upcomingId ?? item.upcomingKey)),
  };
  const draft = editorial.locales?.en;
  const edited = (draft?.entries || []).map(item => ({
    entryId: entryIdsByEvent[item.eventKey],
    headline: item.headline, summary: item.summary, verification: item.verification, timeNote: item.timeNote,
    ...(cleanOptional(item.regionLabel) ? { regionLabel: cleanOptional(item.regionLabel) } : {}),
    ...(cleanOptional(item.releaseTypeLabel) ? { releaseTypeLabel: cleanOptional(item.releaseTypeLabel) } : {}),
    ...(Array.isArray(item.sourceLabels) && item.sourceLabels.length ? { sourceLabels: normalizeSourceLabels(item.sourceLabels) } : {}),
  }));
  const entries = new Map(retained.entries.map(item => [item.entryId, item]));
  for (const item of edited) entries.set(item.entryId, item);
  const order = new Map(canonical.entries.map((item, index) => [item.id, index]));
  return finalizeEnglishOverlay(canonical, {
    archiveTitle: draft?.archiveTitle || (canonical.archiveTitle === previousCanonical.archiveTitle ? previousOverlay.archiveTitle : ""),
    entries: [...entries.values()].sort((a, b) => (order.get(a.entryId) ?? Infinity) - (order.get(b.entryId) ?? Infinity)),
    upcoming: buildUpcomingOverlay(canonical, draft, retained, editorial),
    // Source-report prose describes this review, not a retained story row.
    sourceReport: draft?.sourceReport,
  });
}

export function buildEnglishRepairOverlay({ canonical, draft, retainedPresentation = null, preserveValidatedPresentation = false }) {
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
  if (!isDigest(draft.factsDigest) || draft.factsDigest !== factsDigest(canonical)) {
    const error = !isDigest(draft.factsDigest)
      ? "locale repair factsDigest must be sha256:<64 lowercase hex>"
      : "locale repair factsDigest is stale for canonical facts";
    return {
      status: "unavailable",
      reasonCode: "locale-repair-invalid",
      summary: `${error}; reread the current Canonical edition and trusted locale baseline, then review the complete repair draft before resubmitting.`,
      overlay: null,
      warnings: [],
      errors: [error],
    };
  }
  const retainedIsCurrent = retainedPresentation?.editionId === canonical.id
    && retainedPresentation.factsDigest === draft.factsDigest;
  const retained = retainedIsCurrent ? new Map((retainedPresentation.entries || []).map(item => [item.entryId, item])) : new Map();
  const entries = (draft.entries || []).map((item) => retained.get(item.entryId) || item).map((item) => ({
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
    archiveTitle: retainedIsCurrent ? retainedPresentation.archiveTitle : draft.archiveTitle,
    entries,
    upcoming,
    sourceReport: draft.sourceReport,
  }, draft.factsDigest, { preserveValidatedPresentation });
  if (retainedPresentation && !retainedIsCurrent) {
    result.warnings.push("Retained English presentation was ignored because it is not bound to the current Canonical facts; the complete reviewed draft was used instead.");
  }
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
