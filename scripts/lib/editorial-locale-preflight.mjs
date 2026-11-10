import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateEnglishEditorialLocale } from "./editorial-contract.mjs";
import { sourcesFor } from "./edition-publisher.mjs";
import { validateEnglishOverlay, validateSourceLabels } from "./locale-overlay.mjs";

// Advisory only: never add these findings to Canonical submission errors.
// Final publication still validates the complete, merged English overlay.
export function englishEditorialWarnings({ packet, editorial, previousCanonical = null, previousOverlay = null }) {
  if (!editorial?.locales?.en) return [];
  const warnings = [];
  try {
    warnings.push(...validateEnglishEditorialLocale(editorial));
    const included = new Map((editorial.decisions || []).filter(item => item.decision === "include").map(item => [item.eventKey, item]));
    const packages = new Map((packet?.editorialInput?.packages || []).map(item => [item.eventKey, item]));
    for (const [index, item] of (editorial.locales.en.entries || []).entries()) {
      const decision = included.get(item.eventKey);
      if (!decision) continue;
      const sources = sourcesFor(decision, packages.get(item.eventKey));
      const context = `locales.en.entries[${index}] (${item.eventKey})`;
      const errors = [];
      validateSourceLabels({ sources }, item, context, errors);
      if (errors.length) {
        warnings.push(...errors);
        const order = sources.slice(0, 8).map((source, sourceIndex) => `${sourceIndex}=${source.url}`).join(", ");
        warnings.push(`${context}: sourceLabels.sourceIndex uses zero-based Canonical positions, not packet indexes. Submitted selected-source order (${sources.length}): ${order}${sources.length > 8 ? ", …" : ""}. Retained continuation rows are checked again by the publisher.`);
      }
    }
    if (packet?.continuation?.preservePublished === true) {
      const validBaseline = previousCanonical?.id === editorial.editionId
        && previousOverlay?.editionId === editorial.editionId
        && validateEnglishOverlay(previousCanonical, previousOverlay).valid;
      if (!validBaseline) {
        warnings.push("English continuation has no complete valid same-edition baseline. Batch-only entries/upcoming cannot be assumed to cover retained Canonical content. Keep this submission packet-scoped; use the complete locale-repair flow after higher-priority Canonical work. Chinese publication remains nonblocking.");
      }
    }
  } catch (error) {
    warnings.push(`English preflight could not finish: ${error.message}. Final overlay validation remains authoritative; Chinese validation is unchanged.`);
  }
  return [...new Set(warnings)];
}

async function readOptionalJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function readEnglishEditorialWarnings({ packet, editorial, dataRoot = "public/data" }) {
  const input = { packet, editorial };
  if (!editorial?.locales?.en || packet?.continuation?.preservePublished !== true) return englishEditorialWarnings(input);
  if (!/^\d{4}-\d{2}-\d{2}-(?:am|pm|daily)$/.test(editorial.editionId)) return englishEditorialWarnings(input);
  const [year, month] = editorial.editionId.split("-");
  const suffix = `${year}/${month}/${editorial.editionId}.json`;
  try {
    input.previousCanonical = await readOptionalJson(resolve(dataRoot, "archive", suffix));
    // Match the publisher's archive-first, retained-presentation fallback.
    input.previousOverlay = await readOptionalJson(resolve(dataRoot, "locales/en/archive", suffix))
      || (await readOptionalJson(resolve(dataRoot, "locales/en/status", suffix)))?.retainedPresentation || null;
  } catch (error) {
    return [...englishEditorialWarnings(input), `English baseline could not be read: ${error.message}. Chinese validation is unchanged.`];
  }
  return englishEditorialWarnings(input);
}
