import { assetKey, upcomingKey } from "../../src/lib/locale-projection.js";
import {
  programmaticRegionLabel,
  programmaticReleaseTypeLabel,
  programmaticSourceLabel,
} from "../../src/lib/locale-dictionary.js";
import { canonicalCopyDigest, factsDigest, isDigest, localeDigest } from "./locale-digest.mjs";

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion", "locale", "editionId", "baseSchemaVersion", "factsDigest",
  "canonicalCopyDigest", "localeDigest", "archiveTitle", "entries", "upcoming", "sourceReport",
]);
const ENTRY_KEYS = new Set([
  "entryId", "headline", "summary", "verification", "timeNote", "regionLabel",
  "releaseTypeLabel", "sourceLabels", "mediaAlts",
]);
const SOURCE_LABEL_KEYS = new Set(["sourceIndex", "label"]);
const MEDIA_ALT_KEYS = new Set(["assetKey", "alt", "creditLabel"]);
const UPCOMING_KEYS = new Set([
  "upcomingId", "upcomingKey", "regionLabel", "releaseTypeLabel", "sourceLabel", "coverAlt",
]);
const SOURCE_REPORT_KEYS = new Set(["checked", "limited", "note"]);
const FORBIDDEN_FACT_KEYS = new Set([
  "fact_status", "time_status", "tracking", "entry_flags", "issueNumber", "date", "period",
  "plannedAt", "windowStart", "windowEnd", "timezone", "section", "leadEntryId", "platforms",
  "region", "releaseType", "sources", "source", "images", "cover", "image_status", "cover_status",
  "eventKey", "decision",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value, allowed, context, errors) {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${context}: unknown field ${key}`);
    if (FORBIDDEN_FACT_KEYS.has(key)) errors.push(`${context}: forbidden factual field ${key}`);
  }
}

function requiredEnglish(value, context, errors, minLength = 2) {
  if (typeof value !== "string" || value.trim().length < minLength) {
    errors.push(`${context}: required English text is missing or too short`);
    return;
  }
  if (/\b(?:TODO|TBD|PLACEHOLDER)\b/i.test(value) || /待翻译|占位|暂无英文/u.test(value)) {
    errors.push(`${context}: placeholder text is not allowed`);
  }
  const cjk = (value.match(/[\u3400-\u9fff]/gu) ?? []).length;
  if (cjk >= 4 && cjk / Math.max([...value].length, 1) > 0.15) {
    errors.push(`${context}: text still contains substantial Chinese copy`);
  }
}

function validateSourceLabels(entry, overlayEntry, context, errors) {
  const labels = Array.isArray(overlayEntry.sourceLabels) ? overlayEntry.sourceLabels : [];
  const byIndex = new Map();
  for (const [index, item] of labels.entries()) {
    const itemContext = `${context}.sourceLabels[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${itemContext}: must be an object`);
      continue;
    }
    unknownKeys(item, SOURCE_LABEL_KEYS, itemContext, errors);
    if (!Number.isInteger(item.sourceIndex) || item.sourceIndex < 0 || item.sourceIndex >= (entry.sources ?? []).length) {
      errors.push(`${itemContext}: sourceIndex does not resolve to canonical source`);
      continue;
    }
    if (byIndex.has(item.sourceIndex)) errors.push(`${itemContext}: duplicate sourceIndex`);
    byIndex.set(item.sourceIndex, item);
    requiredEnglish(item.label, `${itemContext}.label`, errors);
  }
  for (const [sourceIndex, source] of (entry.sources ?? []).entries()) {
    if (!programmaticSourceLabel(source.label) && !byIndex.has(sourceIndex)) {
      errors.push(`${context}: source ${sourceIndex} needs an English source label`);
    }
  }
}

function validateMediaAlts(entry, overlayEntry, context, errors) {
  const canonicalAssets = new Set((entry.images ?? []).map((asset) => assetKey(entry.id, asset)));
  const seen = new Set();
  for (const [index, item] of (overlayEntry.mediaAlts ?? []).entries()) {
    const itemContext = `${context}.mediaAlts[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${itemContext}: must be an object`);
      continue;
    }
    unknownKeys(item, MEDIA_ALT_KEYS, itemContext, errors);
    if (typeof item.assetKey !== "string" || !canonicalAssets.has(item.assetKey)) {
      errors.push(`${itemContext}: assetKey does not resolve to canonical media`);
    }
    if (seen.has(item.assetKey)) errors.push(`${itemContext}: duplicate assetKey`);
    seen.add(item.assetKey);
    requiredEnglish(item.alt, `${itemContext}.alt`, errors);
    if (item.creditLabel !== undefined) requiredEnglish(item.creditLabel, `${itemContext}.creditLabel`, errors);
  }
}

function validateEntries(canonical, overlay, errors) {
  if (!Array.isArray(overlay.entries)) {
    errors.push("overlay.entries must be an array");
    return;
  }
  if (overlay.entries.length !== (canonical.entries ?? []).length) {
    errors.push("overlay.entries must cover every canonical entry exactly once");
  }
  const seen = new Set();
  for (const [index, canonicalEntry] of (canonical.entries ?? []).entries()) {
    const item = overlay.entries[index];
    const context = `entries[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${context}: missing or invalid entry overlay`);
      continue;
    }
    unknownKeys(item, ENTRY_KEYS, context, errors);
    if (item.entryId !== canonicalEntry.id) errors.push(`${context}: entryId/order does not match canonical entry`);
    if (seen.has(item.entryId)) errors.push(`${context}: duplicate entryId`);
    seen.add(item.entryId);
    requiredEnglish(item.headline, `${context}.headline`, errors, 6);
    requiredEnglish(item.summary, `${context}.summary`, errors, 12);
    requiredEnglish(item.verification, `${context}.verification`, errors, 6);
    requiredEnglish(item.timeNote, `${context}.timeNote`, errors, 4);
    if (!programmaticRegionLabel(canonicalEntry.region)) {
      requiredEnglish(item.regionLabel, `${context}.regionLabel`, errors);
    } else if (item.regionLabel !== undefined) {
      requiredEnglish(item.regionLabel, `${context}.regionLabel`, errors);
    }
    if (!programmaticReleaseTypeLabel(canonicalEntry.releaseType)) {
      requiredEnglish(item.releaseTypeLabel, `${context}.releaseTypeLabel`, errors);
    } else if (item.releaseTypeLabel !== undefined) {
      requiredEnglish(item.releaseTypeLabel, `${context}.releaseTypeLabel`, errors);
    }
    validateSourceLabels(canonicalEntry, item, context, errors);
    validateMediaAlts(canonicalEntry, item, context, errors);
  }
  for (const item of overlay.entries) {
    if (isRecord(item) && !canonical.entries?.some((entry) => entry.id === item.entryId)) {
      errors.push(`overlay contains unknown entryId: ${String(item.entryId)}`);
    }
  }
}

function validateUpcoming(canonical, overlay, errors) {
  if (!Array.isArray(overlay.upcoming)) {
    errors.push("overlay.upcoming must be an array");
    return;
  }
  if (overlay.upcoming.length !== (canonical.upcoming ?? []).length) {
    errors.push("overlay.upcoming must cover every canonical upcoming item exactly once");
  }
  const seen = new Set();
  for (const [index, canonicalItem] of (canonical.upcoming ?? []).entries()) {
    const item = overlay.upcoming[index];
    const context = `upcoming[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${context}: missing or invalid upcoming overlay`);
      continue;
    }
    unknownKeys(item, UPCOMING_KEYS, context, errors);
    const canonicalKey = upcomingKey(canonical.id, canonicalItem);
    const overlayKey = item.upcomingId ?? item.upcomingKey;
    if (overlayKey !== canonicalKey) errors.push(`${context}: upcoming identity/order does not match canonical item`);
    if (seen.has(overlayKey)) errors.push(`${context}: duplicate upcoming identity`);
    seen.add(overlayKey);
    if (!programmaticRegionLabel(canonicalItem.region)) requiredEnglish(item.regionLabel, `${context}.regionLabel`, errors);
    if (!programmaticReleaseTypeLabel(canonicalItem.releaseType)) requiredEnglish(item.releaseTypeLabel, `${context}.releaseTypeLabel`, errors);
    if (!programmaticSourceLabel(canonicalItem.source?.label)) requiredEnglish(item.sourceLabel, `${context}.sourceLabel`, errors);
    if (canonicalItem.cover && item.coverAlt !== undefined) requiredEnglish(item.coverAlt, `${context}.coverAlt`, errors);
  }
}

export function validateEnglishOverlay(canonical, overlay) {
  const errors = [];
  const warnings = [];
  if (!isRecord(canonical)) return { valid: false, errors: ["canonical edition must be an object"], warnings, summary: "Canonical edition is invalid." };
  if (!isRecord(overlay)) return { valid: false, errors: ["English overlay must be an object"], warnings, summary: "English overlay is invalid." };
  unknownKeys(overlay, TOP_LEVEL_KEYS, "overlay", errors);
  if (overlay.schemaVersion !== 1) errors.push("overlay.schemaVersion must be 1");
  if (overlay.locale !== "en") errors.push("overlay.locale must be en");
  if (overlay.editionId !== canonical.id) errors.push("overlay.editionId must match canonical edition");
  if (overlay.baseSchemaVersion !== (canonical.schemaVersion ?? 1)) errors.push("overlay.baseSchemaVersion must match canonical schemaVersion");
  for (const key of ["factsDigest", "canonicalCopyDigest", "localeDigest"]) {
    if (!isDigest(overlay[key])) errors.push(`overlay.${key} must be sha256:<64 lowercase hex>`);
  }
  const expectedFactsDigest = factsDigest(canonical);
  if (isDigest(overlay.factsDigest) && overlay.factsDigest !== expectedFactsDigest) errors.push("overlay.factsDigest is stale for canonical facts");
  const expectedCopyDigest = canonicalCopyDigest(canonical);
  if (isDigest(overlay.canonicalCopyDigest) && overlay.canonicalCopyDigest !== expectedCopyDigest) {
    warnings.push("overlay.canonicalCopyDigest differs from current Simplified Chinese presentation");
  }
  const prefix = canonical.period === "pm" ? "Evening Brief |" : "Morning Brief |";
  requiredEnglish(overlay.archiveTitle, "overlay.archiveTitle", errors, prefix.length + 2);
  if (typeof overlay.archiveTitle === "string" && !overlay.archiveTitle.startsWith(prefix)) {
    errors.push(`overlay.archiveTitle should start with ${prefix}`);
  }
  validateEntries(canonical, overlay, errors);
  validateUpcoming(canonical, overlay, errors);
  if (overlay.sourceReport !== undefined) {
    if (!isRecord(overlay.sourceReport)) {
      errors.push("overlay.sourceReport must be an object when present");
    } else {
      unknownKeys(overlay.sourceReport, SOURCE_REPORT_KEYS, "sourceReport", errors);
      if (!Array.isArray(overlay.sourceReport.checked) || !Array.isArray(overlay.sourceReport.limited)) {
        errors.push("sourceReport.checked and sourceReport.limited must be arrays");
      } else {
        overlay.sourceReport.checked.forEach((value, index) => requiredEnglish(value, `sourceReport.checked[${index}]`, errors));
        overlay.sourceReport.limited.forEach((value, index) => requiredEnglish(value, `sourceReport.limited[${index}]`, errors));
      }
      requiredEnglish(overlay.sourceReport.note, "sourceReport.note", errors, 4);
    }
  }
  if (isDigest(overlay.localeDigest)) {
    const expectedLocaleDigest = localeDigest(overlay);
    if (overlay.localeDigest !== expectedLocaleDigest) errors.push("overlay.localeDigest cannot be reproduced");
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: errors.length ? `English overlay rejected: ${errors.join("; ")}` : "English overlay is valid.",
  };
}
