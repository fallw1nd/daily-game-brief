import { isDeepStrictEqual } from "node:util";
import { validateEnglishOverlay } from "./locale-overlay.mjs";
import { buildEnglishRepairOverlay } from "./bilingual-publisher.mjs";
import { generatedEditorialAlt } from "./media-alt.mjs";
import { factsDigest } from "./locale-digest.mjs";
import { programmaticRegionLabel } from "../../src/lib/locale-dictionary.js";

const own = (object, key) => Object.hasOwn(object, key);
const FIELD_MAP = { headline: "headline", summary: "summary", region: "regionLabel" };
function fail(message) { throw new Error(`archive correction: ${message}`); }
function record(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  if (Object.keys(value).some(key => !keys.includes(key))) fail(`${label} has unknown fields`);
}
function nonempty(value, label) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) fail(`${label} must be a nonempty trimmed string`);
}
function unique(rows, key, label) {
  if (!Array.isArray(rows) || rows.some(row => !row?.[key]) || new Set(rows.map(row => row[key])).size !== rows.length) fail(`${label} has missing or duplicate identities`);
}
function overlayPresentation(overlay) {
  const copy = structuredClone(overlay);
  for (const key of ["factsDigest", "canonicalCopyDigest", "localeDigest"]) delete copy[key];
  return copy;
}

/** Pure, evidence-attested manual adapter. No input mutation, writes, or state/ledger work. */
export function planArchiveCorrection({ canonical, overlay, manifest, request, archiveBlobSha, overlayBlobSha }) {
  record(request, ["schemaVersion", "kind", "editionId", "expectedArchiveBlobSha", "expectedOverlayBlobSha", "corrections"], "request");
  if (request.schemaVersion !== 1 || request.kind !== "archive_correction") fail("unsupported request envelope");
  if (!/^\d{4}-\d{2}-\d{2}-(?:am|pm|daily)$/.test(request.editionId || "")) fail("invalid edition identity");
  for (const [key, actual] of [["expectedArchiveBlobSha", archiveBlobSha], ["expectedOverlayBlobSha", overlayBlobSha]]) {
    if (!/^[0-9a-f]{40}$/.test(request[key] || "") || request[key] !== actual) fail(`stale or invalid ${key}`);
  }
  const id = request.editionId, [year, month] = id.split("-");
  const archivePath = `archive/${year}/${month}/${id}.json`;
  unique(manifest?.editions, "id", "manifest");
  if (new Set(manifest.editions.map(row => row.path)).size !== manifest.editions.length) fail("manifest has duplicate paths");
  const item = manifest.editions.find(row => row.id === id);
  if (!item || item.path !== archivePath || canonical?.id !== id || overlay?.editionId !== id
    || canonical.date !== id.slice(0, 10) || canonical.period !== id.split("-").at(-1)
    || item.date !== canonical.date || item.period !== canonical.period
    || item.issueNumber !== canonical.issueNumber || item.archiveTitle !== canonical.archiveTitle
    || item.leadEntryId !== canonical.leadEntryId) fail("manifest/archive identity mismatch");
  unique(canonical.entries, "id", "canonical entries");
  unique(overlay.entries, "entryId", "English entries");
  if (!validateEnglishOverlay(canonical, overlay).valid) fail("current English overlay is invalid or stale");
  if (!Array.isArray(request.corrections) || !request.corrections.length || request.corrections.length > 100) fail("corrections must contain 1–100 entries");
  unique(request.corrections, "entryId", "corrections");
  const next = structuredClone(canonical), presentation = structuredClone(overlay);
  const allowed = new Map();
  const allowedAlts = new Map();
  for (const correction of request.corrections) {
    record(correction, ["entryId", "expected", "replacement", "englishExpected", "englishReplacement", "evidence"], "correction");
    const entry = next.entries.find(row => row.id === correction.entryId);
    const english = presentation.entries.find(row => row.entryId === correction.entryId);
    if (!entry || !english) fail("unknown correction entry");
    record(correction.expected, Object.keys(FIELD_MAP), "expected");
    record(correction.replacement, Object.keys(FIELD_MAP), "replacement");
    const fields = Object.keys(correction.replacement);
    if (!fields.length || !isDeepStrictEqual([...fields].sort(), Object.keys(correction.expected).sort())) fail("expected/replacement fields must match");
    const englishFields = fields.map(key => FIELD_MAP[key]);
    record(correction.englishExpected, englishFields, "englishExpected");
    record(correction.englishReplacement, englishFields, "englishReplacement");
    if (!isDeepStrictEqual(Object.keys(correction.englishExpected).sort(), [...englishFields].sort())
      || !isDeepStrictEqual(Object.keys(correction.englishReplacement).sort(), [...englishFields].sort())) fail("matching English fields required");
    record(correction.evidence, ["sourceUrl", "excerpt", "reason"], "evidence");
    for (const key of ["sourceUrl", "excerpt", "reason"]) nonempty(correction.evidence[key], `evidence.${key}`);
    if (!entry.sources?.some(source => source.url === correction.evidence.sourceUrl)) fail("evidence URL must be an original selected source");
    for (const field of fields) {
      const en = FIELD_MAP[field];
      nonempty(correction.replacement[field], `replacement.${field}`);
      nonempty(correction.englishReplacement[en], `englishReplacement.${en}`);
      if (!own(entry, field) || entry[field] !== correction.expected[field]) fail(`stale expected ${field}`);
      // null means the optional English field was absent, not an unchecked wildcard.
      if ((own(english, en) ? english[en] : null) !== correction.englishExpected[en]) fail(`stale English expected ${en}`);
      if (correction.replacement[field] === entry[field]) fail(`unchanged ${field}`);
      if (field === "headline" && entry.id === canonical.leadEntryId) fail("lead headline correction requires title-aware revision");
      if (field === "region") {
        const translated = programmaticRegionLabel(correction.replacement.region);
        if (translated && translated !== correction.englishReplacement.regionLabel) fail("English region label contradicts dictionary");
      }
      if (field === "headline") {
        const oldGenerated = generatedEditorialAlt(entry);
        for (const [index, asset] of (entry.images || []).entries()) {
          if (asset.alt === oldGenerated && asset.alt.includes(entry.headline)) {
            const previousAlt = asset.alt;
            asset.alt = asset.alt.replaceAll(entry.headline, correction.replacement.headline);
            allowedAlts.set(`${entry.id}:${index}`, { previousAlt, nextAlt: asset.alt });
          }
        }
      }
      entry[field] = correction.replacement[field];
      english[en] = correction.englishReplacement[en];
    }
    allowed.set(entry.id, fields);
  }
  // Defense in depth: the protected projection must be identical in both languages.
  const strip = (value, english = false) => {
    const result = structuredClone(value);
    for (const entry of result.entries) {
      for (const field of allowed.get(english ? entry.entryId : entry.id) || []) delete entry[english ? FIELD_MAP[field] : field];
      if (!english) for (const [index, asset] of (entry.images || []).entries()) {
        const allowedAlt = allowedAlts.get(`${entry.id}:${index}`);
        if (allowedAlt && asset.alt === allowedAlt.nextAlt) asset.alt = allowedAlt.previousAlt;
      }
    }
    return result;
  };
  if (!isDeepStrictEqual(strip(next), strip(canonical))) fail("protected canonical projection changed");
  if (!isDeepStrictEqual(strip(presentation, true), strip(overlay, true))) fail("protected English projection changed");
  const built = buildEnglishRepairOverlay({ canonical: next, draft: { ...presentation, factsDigest: factsDigest(next) }, retainedPresentation: null, preserveValidatedPresentation: true });
  if (built.status !== "available" || !built.overlay) fail(`repaired English overlay invalid: ${(built.errors || []).join("; ")}`);
  if (!isDeepStrictEqual(overlayPresentation(built.overlay), overlayPresentation(presentation))) fail("English rebuild changed protected presentation");
  return { archivePath, overlayPath: `locales/en/archive/${year}/${month}/${id}.json`, canonical: next, overlay: built.overlay };
}
