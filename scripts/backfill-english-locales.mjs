import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assetKey, upcomingKey } from "../src/lib/locale-projection.js";
import { canonicalCopyDigest, factsDigest, localeDigest } from "./lib/locale-digest.mjs";
import { validateEnglishOverlay } from "./lib/locale-overlay.mjs";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim();
const TARGET_EDITION = process.env.BACKFILL_EDITION?.trim() || null;
const MODEL = process.env.ENGLISH_BACKFILL_MODEL?.trim() || "deepseek-v4-flash";
const API_URL = "https://api.deepseek.com/responses";
const USER_AGENT = "DailyGameBriefEnglishBackfill/1.0 (+https://fallw1nd.github.io/daily-game-brief/)";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is required for historical English backfill");

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function outputText(response) {
  return (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text || "")
    .join("");
}

function overlayPath(editionId) {
  const [year, month] = editionId.split("-");
  return resolve("public/data/locales/en/archive", year, month, `${editionId}.json`);
}

function statusPath(editionId) {
  const [year, month] = editionId.split("-");
  return resolve("public/data/locales/en/status", year, month, `${editionId}.json`);
}

async function readCanonicalState() {
  const manifestText = await readFile("public/data/manifest.json", "utf8");
  const latestText = await readFile("public/data/latest.json", "utf8");
  const manifest = JSON.parse(manifestText);
  const archives = {};
  for (const item of manifest.editions || []) {
    const text = await readFile(resolve("public/data", item.path), "utf8");
    archives[item.path] = sha256Text(text);
  }
  return {
    manifest,
    hashes: {
      manifest: sha256Text(manifestText),
      latest: sha256Text(latestText),
      archives,
    },
  };
}

function canonicalInput(edition) {
  return {
    editionId: edition.id,
    period: edition.period,
    archiveTitle: edition.archiveTitle || "",
    entries: (edition.entries || []).map((entry) => ({
      entryId: entry.id,
      titleEn: entry.title?.title_en || "",
      titleZhCn: entry.title?.title_zh_cn || "",
      headline: entry.headline || "",
      summary: entry.summary || "",
      verification: entry.verification || "",
      timeNote: entry.timeNote || "",
      region: entry.region || "",
      releaseType: entry.releaseType || "",
      sources: (entry.sources || []).map((source, sourceIndex) => ({
        sourceIndex,
        label: source.label || "",
      })),
      media: (entry.images || []).map((image) => ({
        assetKey: assetKey(entry.id, image),
        alt: image.alt || "",
        credit: image.credit || "",
      })),
    })),
    upcoming: (edition.upcoming || []).map((item) => ({
      upcomingId: upcomingKey(edition.id, item),
      titleEn: item.title?.title_en || "",
      titleZhCn: item.title?.title_zh_cn || "",
      region: item.region || "",
      releaseType: item.releaseType || "",
      sourceLabel: item.source?.label || "",
      coverAlt: item.cover?.alt || "",
      hasCover: Boolean(item.cover),
    })),
  };
}

function responseSchema() {
  const nullableString = { type: ["string", "null"] };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      archiveTitle: { type: "string" },
      entries: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            entryId: { type: "string" },
            headline: { type: "string" },
            summary: { type: "string" },
            verification: { type: "string" },
            timeNote: { type: "string" },
            regionLabel: nullableString,
            releaseTypeLabel: nullableString,
            sourceLabels: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  sourceIndex: { type: "integer" },
                  label: { type: "string" },
                },
                required: ["sourceIndex", "label"],
              },
            },
            mediaAlts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  assetKey: { type: "string" },
                  alt: { type: "string" },
                },
                required: ["assetKey", "alt"],
              },
            },
          },
          required: [
            "entryId", "headline", "summary", "verification", "timeNote",
            "regionLabel", "releaseTypeLabel", "sourceLabels", "mediaAlts",
          ],
        },
      },
      upcoming: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            upcomingId: { type: "string" },
            regionLabel: nullableString,
            releaseTypeLabel: nullableString,
            sourceLabel: nullableString,
            coverAlt: nullableString,
          },
          required: ["upcomingId", "regionLabel", "releaseTypeLabel", "sourceLabel", "coverAlt"],
        },
      },
    },
    required: ["archiveTitle", "entries", "upcoming"],
  };
}

function instructions() {
  return [
    "You are the English presentation editor for a factual video-game news brief.",
    "Translate and localize ONLY the supplied canonical Simplified Chinese presentation into concise natural English.",
    "The supplied JSON is the complete factual boundary. Do not browse, infer, add, remove, upgrade, soften, or reinterpret any fact.",
    "Preserve all dates, times, numbers, platforms, uncertainty, verification status, attribution and scope exactly as expressed in the source text.",
    "Use titleEn as the game/product name in English copy whenever the source refers to that subject; never invent an English title.",
    "Do not translate identifiers: entryId, upcomingId, sourceIndex and assetKey must be returned exactly as supplied and in the same order.",
    "Return one entry for every supplied entry and one upcoming item for every supplied upcoming item, in the same order.",
    "Translate every source label into a short natural English label. Translate every supplied media alt into useful English accessibility text.",
    "For regionLabel, releaseTypeLabel, sourceLabel and coverAlt, use null only when the source value is genuinely empty or no cover exists; otherwise provide English text.",
    "archiveTitle must begin exactly with 'Morning Brief |' for am or 'Evening Brief |' for pm and summarize the same lead fact without hype.",
    "verification and timeNote are evidence copy, not marketing copy. Keep them precise and conservative.",
    "Do not output Chinese prose. Proper nouns may remain in their established original spelling when appropriate.",
  ].join(" ");
}

async function requestTranslation(input, repairErrors = []) {
  const body = {
    model: MODEL,
    instructions: instructions(),
    input: JSON.stringify({
      canonical: input,
      ...(repairErrors.length ? { validatorErrorsToRepair: repairErrors } : {}),
    }),
    reasoning: { effort: "none" },
    max_output_tokens: 12000,
    temperature: 0.1,
    text: {
      format: {
        type: "json_schema",
        name: "historical_english_overlay_copy",
        schema: responseSchema(),
      },
    },
  };

  const response = await fetch(API_URL, {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error("DeepSeek English backfill response is too large");
  if (!response.ok) throw new Error(`DeepSeek English backfill HTTP ${response.status}: ${text.slice(0, 500)}`);
  const data = JSON.parse(text);
  if (data.status === "failed") throw new Error(data.error?.message || "DeepSeek English backfill failed");
  const output = outputText(data);
  if (!output) throw new Error("DeepSeek English backfill returned no structured output");
  return JSON.parse(output);
}

function cleanOptional(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function assertIdentity(input, draft) {
  if (!Array.isArray(draft.entries) || draft.entries.length !== input.entries.length) {
    throw new Error(`${input.editionId}: translated entries do not cover canonical entries exactly once`);
  }
  if (!Array.isArray(draft.upcoming) || draft.upcoming.length !== input.upcoming.length) {
    throw new Error(`${input.editionId}: translated upcoming does not cover canonical upcoming exactly once`);
  }
  input.entries.forEach((entry, index) => {
    if (draft.entries[index]?.entryId !== entry.entryId) {
      throw new Error(`${input.editionId}: translated entry identity/order mismatch at ${index}`);
    }
    const expectedSources = entry.sources.map((source) => source.sourceIndex);
    const actualSources = (draft.entries[index]?.sourceLabels || []).map((source) => source.sourceIndex);
    if (JSON.stringify(actualSources) !== JSON.stringify(expectedSources)) {
      throw new Error(`${input.editionId}: source label identity/order mismatch for ${entry.entryId}`);
    }
    const expectedMedia = entry.media.map((media) => media.assetKey);
    const actualMedia = (draft.entries[index]?.mediaAlts || []).map((media) => media.assetKey);
    if (JSON.stringify(actualMedia) !== JSON.stringify(expectedMedia)) {
      throw new Error(`${input.editionId}: media alt identity/order mismatch for ${entry.entryId}`);
    }
  });
  input.upcoming.forEach((item, index) => {
    if (draft.upcoming[index]?.upcomingId !== item.upcomingId) {
      throw new Error(`${input.editionId}: translated upcoming identity/order mismatch at ${index}`);
    }
  });
}

function buildOverlay(canonical, input, draft) {
  assertIdentity(input, draft);
  const entries = draft.entries.map((item) => ({
    entryId: item.entryId,
    headline: item.headline,
    summary: item.summary,
    verification: item.verification,
    timeNote: item.timeNote,
    ...(cleanOptional(item.regionLabel) ? { regionLabel: cleanOptional(item.regionLabel) } : {}),
    ...(cleanOptional(item.releaseTypeLabel) ? { releaseTypeLabel: cleanOptional(item.releaseTypeLabel) } : {}),
    ...(item.sourceLabels?.length ? {
      sourceLabels: item.sourceLabels.map((source) => ({ sourceIndex: source.sourceIndex, label: source.label })),
    } : {}),
    ...(item.mediaAlts?.length ? {
      mediaAlts: item.mediaAlts.map((media) => ({ assetKey: media.assetKey, alt: media.alt })),
    } : {}),
  }));
  const upcoming = draft.upcoming.map((item) => ({
    upcomingId: item.upcomingId,
    ...(cleanOptional(item.regionLabel) ? { regionLabel: cleanOptional(item.regionLabel) } : {}),
    ...(cleanOptional(item.releaseTypeLabel) ? { releaseTypeLabel: cleanOptional(item.releaseTypeLabel) } : {}),
    ...(cleanOptional(item.sourceLabel) ? { sourceLabel: cleanOptional(item.sourceLabel) } : {}),
    ...(cleanOptional(item.coverAlt) ? { coverAlt: cleanOptional(item.coverAlt) } : {}),
  }));
  const overlay = {
    schemaVersion: 1,
    locale: "en",
    editionId: canonical.id,
    baseSchemaVersion: canonical.schemaVersion ?? 1,
    factsDigest: factsDigest(canonical),
    canonicalCopyDigest: canonicalCopyDigest(canonical),
    localeDigest: `sha256:${"0".repeat(64)}`,
    archiveTitle: draft.archiveTitle,
    entries,
    upcoming,
  };
  overlay.localeDigest = localeDigest(overlay);
  return overlay;
}

async function translateEdition(canonical) {
  const input = canonicalInput(canonical);
  let draft = await requestTranslation(input);
  let overlay = buildOverlay(canonical, input, draft);
  let validation = validateEnglishOverlay(canonical, overlay);
  if (!validation.valid) {
    draft = await requestTranslation(input, validation.errors);
    overlay = buildOverlay(canonical, input, draft);
    validation = validateEnglishOverlay(canonical, overlay);
  }
  if (!validation.valid) {
    throw new Error(`${canonical.id}: English overlay rejected after repair: ${validation.errors.join("; ")}`);
  }
  return { overlay, warnings: validation.warnings };
}

const before = await readCanonicalState();
const editions = (before.manifest.editions || []).filter((item) => !TARGET_EDITION || item.id === TARGET_EDITION);
if (TARGET_EDITION && editions.length !== 1) throw new Error(`Unknown BACKFILL_EDITION: ${TARGET_EDITION}`);
if (!editions.length) throw new Error("No canonical editions selected for English backfill");

const summary = {
  schemaVersion: 1,
  model: MODEL,
  selected: editions.length,
  generated: [],
  warnings: [],
  canonicalHashesBefore: before.hashes,
};

for (const [index, item] of editions.entries()) {
  const canonical = JSON.parse(await readFile(resolve("public/data", item.path), "utf8"));
  console.log(`[${index + 1}/${editions.length}] Translating ${canonical.id}...`);
  const result = await translateEdition(canonical);
  const target = overlayPath(canonical.id);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(result.overlay, null, 2) + "\n");
  await rm(statusPath(canonical.id), { force: true });
  summary.generated.push({
    editionId: canonical.id,
    issueNumber: canonical.issueNumber,
    entries: canonical.entries?.length || 0,
    upcoming: canonical.upcoming?.length || 0,
    factsDigest: result.overlay.factsDigest,
    localeDigest: result.overlay.localeDigest,
  });
  for (const warning of result.warnings || []) summary.warnings.push({ editionId: canonical.id, warning });
}

const after = await readCanonicalState();
if (JSON.stringify(before.hashes) !== JSON.stringify(after.hashes)) {
  throw new Error("Historical English backfill attempted to change Canonical archive/latest/manifest bytes");
}
summary.canonicalHashesAfter = after.hashes;
summary.canonicalUnchanged = true;

await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/english-backfill-summary.json", JSON.stringify(summary, null, 2) + "\n");
console.log(`Generated ${summary.generated.length} validated English Overlay(s); Canonical publication bytes unchanged.`);
