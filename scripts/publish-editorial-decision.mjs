import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { buildEdition } from "./lib/edition-publisher.mjs";
import { validateEditorialOutput } from "./lib/editorial-contract.mjs";
import {
  buildEnglishOverlay,
  buildLocaleUnavailableStatus,
  deriveEntryIdsByEvent,
  localeArchivePath,
  localeStatusPath,
} from "./lib/bilingual-publisher.mjs";

const run = promisify(execFile);
const PACKET_PATH = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");
const DECISION_PATH = resolve(process.env.EDITORIAL_DECISION_PATH || "artifacts/editorial-decisions.json");
const RESULT_PATH = resolve(process.env.PUBLICATION_RESULT_PATH || "artifacts/publication-result.json");
const PUBLICATION_MODE = process.env.PUBLICATION_MODE || "publish";
if (!new Set(["publish", "locale-repair"]).has(PUBLICATION_MODE)) {
  throw new Error(`Unsupported PUBLICATION_MODE: ${PUBLICATION_MODE}`);
}

function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function readOptionalJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

async function previousEnglishOverlay(manifest, editionId) {
  const index = manifest.editions.findIndex((item) => item.id === editionId);
  if (index <= 0) return null;
  const previous = manifest.editions[index - 1];
  return readOptionalJson(resolve("public/data", localeArchivePath(previous.id)));
}

async function writePublicationResult(value) {
  await mkdir(dirname(RESULT_PATH), { recursive: true });
  await writeFile(RESULT_PATH, JSON.stringify(value, null, 2) + "\n");
}

async function rebuildGeneratedIndexes() {
  await run(process.execPath, ["scripts/build-locale-index.mjs"]);
  await run(process.execPath, ["scripts/build-search-index.mjs"]);
}

async function writeLocalePlan(canonical, localePlan) {
  const overlayFile = resolve("public/data", localeArchivePath(canonical.id));
  const statusFile = resolve("public/data", localeStatusPath(canonical.id));
  if (localePlan.status === "available") {
    await mkdir(dirname(overlayFile), { recursive: true });
    await writeFile(overlayFile, JSON.stringify(localePlan.overlay, null, 2) + "\n");
    await rm(statusFile, { force: true });
    return;
  }
  const status = buildLocaleUnavailableStatus({
    canonical,
    reasonCode: localePlan.reasonCode,
    summary: localePlan.summary,
    observedAt: canonical.generatedAt,
  });
  await mkdir(dirname(statusFile), { recursive: true });
  await writeFile(statusFile, JSON.stringify(status, null, 2) + "\n");
  await rm(overlayFile, { force: true });
}

const packet = JSON.parse(await readFile(PACKET_PATH, "utf8"));
const editorial = JSON.parse(await readFile(DECISION_PATH, "utf8"));
const [latestText, manifestText] = await Promise.all([
  readFile("public/data/latest.json", "utf8"),
  readFile("public/data/manifest.json", "utf8"),
]);
const latest = JSON.parse(latestText);
const manifest = JSON.parse(manifestText);
const contractErrors = PUBLICATION_MODE === "locale-repair" ? [] : validateEditorialOutput(editorial, packet.editorialInput);
if (contractErrors.length) throw new Error(`Editorial decisions failed evidence validation:\n- ${contractErrors.join("\n- ")}`);

if (PUBLICATION_MODE === "locale-repair") {
  const manifestItem = manifest.editions.find((item) => item.id === editorial.editionId);
  if (!manifestItem) throw new Error(`Cannot repair locale for unpublished edition ${editorial.editionId}`);
  const archiveFile = resolve("public/data", manifestItem.path);
  const archiveTextBefore = await readFile(archiveFile, "utf8");
  const canonical = JSON.parse(archiveTextBefore);
  const beforeHashes = {
    archive: sha256Text(archiveTextBefore),
    latest: sha256Text(latestText),
    manifest: sha256Text(manifestText),
  };
  const priorOverlay = await previousEnglishOverlay(manifest, editorial.editionId);
  const localePlan = buildEnglishOverlay({
    canonical,
    editorial,
    entryIdsByEvent: deriveEntryIdsByEvent(editorial),
    previousOverlay: priorOverlay,
  });
  if (localePlan.status !== "available") {
    throw new Error(`Locale repair rejected: ${localePlan.summary}`);
  }
  const overlayFile = resolve("public/data", localeArchivePath(canonical.id));
  const nextOverlayText = JSON.stringify(localePlan.overlay, null, 2) + "\n";
  const existingOverlayText = await exists(overlayFile) ? await readFile(overlayFile, "utf8") : null;
  const statusFile = resolve("public/data", localeStatusPath(canonical.id));
  const hadStatus = await exists(statusFile);
  if (existingOverlayText !== nextOverlayText || hadStatus) {
    await writeLocalePlan(canonical, localePlan);
  }
  await rebuildGeneratedIndexes();
  const [archiveAfter, latestAfter, manifestAfter] = await Promise.all([
    readFile(archiveFile, "utf8"),
    readFile("public/data/latest.json", "utf8"),
    readFile("public/data/manifest.json", "utf8"),
  ]);
  const afterHashes = {
    archive: sha256Text(archiveAfter),
    latest: sha256Text(latestAfter),
    manifest: sha256Text(manifestAfter),
  };
  if (JSON.stringify(beforeHashes) !== JSON.stringify(afterHashes)) {
    throw new Error("locale-repair attempted to change canonical publication files");
  }
  await writePublicationResult({
    editionId: editorial.editionId,
    status: existingOverlayText === nextOverlayText && !hadStatus ? "locale-repair-noop" : "locale-repaired",
    publicationMode: "locale-repair",
    canonicalStatus: "unchanged",
    localeStatus: "available",
    localeWarnings: localePlan.warnings,
    feedbackEligible: false,
    canonicalHashes: beforeHashes,
  });
  console.log(`${editorial.editionId}: English locale repaired; canonical publication hashes unchanged.`);
  process.exit(0);
}

const now = process.env.BRIEF_NOW ? new Date(process.env.BRIEF_NOW) : new Date();
const result = buildEdition({ packet, editorial, latest, manifest, now });
if (result.status === "already-exists") {
  const manifestItem = manifest.editions.find((item) => item.id === editorial.editionId);
  const existingEdition = manifestItem
    ? JSON.parse(await readFile(resolve("public/data", manifestItem.path), "utf8"))
    : null;
  const feedbackEligible = existingEdition?.sourceReport?.editorialDecisionDigest === result.decisionDigest;
  let localeStatus = "unchanged";
  if (feedbackEligible && editorial.locales?.en) {
    const priorOverlay = await previousEnglishOverlay(manifest, editorial.editionId);
    const localePlan = buildEnglishOverlay({
      canonical: existingEdition,
      editorial,
      entryIdsByEvent: deriveEntryIdsByEvent(editorial),
      previousOverlay: priorOverlay,
    });
    if (localePlan.status === "available") {
      await writeLocalePlan(existingEdition, localePlan);
      await rebuildGeneratedIndexes();
      localeStatus = "available";
    }
  }
  await writePublicationResult({
    editionId: editorial.editionId,
    status: localeStatus === "available" ? "already-exists-locale-repaired" : result.status,
    publicationMode: "publish",
    decisionDigest: result.decisionDigest,
    canonicalStatus: "unchanged",
    localeStatus,
    feedbackEligible,
  });
  console.log(`${editorial.editionId} already exists; canonical unchanged; locale=${localeStatus}.`);
  process.exit(0);
}

const priorOverlay = await readOptionalJson(resolve("public/data", localeArchivePath(latest.id)));
const localePlan = buildEnglishOverlay({
  canonical: result.edition,
  editorial,
  entryIdsByEvent: result.entryIdsByEvent,
  previousOverlay: priorOverlay,
});

const archiveFile = resolve("public/data", result.archivePath);
await mkdir(dirname(archiveFile), { recursive: true });
const editionText = JSON.stringify(result.edition, null, 2) + "\n";
await Promise.all([
  writeFile(archiveFile, editionText),
  writeFile("public/data/latest.json", editionText),
  writeFile("public/data/manifest.json", JSON.stringify(result.manifest, null, 2) + "\n"),
]);
await writeLocalePlan(result.edition, localePlan);
await rebuildGeneratedIndexes();
await writePublicationResult({
  editionId: editorial.editionId,
  status: result.status,
  publicationMode: "publish",
  decisionDigest: result.decisionDigest,
  canonicalStatus: "published",
  localeStatus: localePlan.status,
  localeReasonCode: localePlan.reasonCode,
  localeSummary: localePlan.summary,
  localeWarnings: localePlan.warnings,
  localeErrors: localePlan.errors || [],
  feedbackEligible: true,
});
if (localePlan.status === "available") {
  console.log(`${result.status === "revised" ? "Revised" : "Built"} ${result.edition.id} issue ${result.edition.issueNumber}: bilingual publication ready.`);
} else {
  console.log(`${result.status === "revised" ? "Revised" : "Built"} ${result.edition.id} issue ${result.edition.issueNumber}: Chinese publication ready; English degraded (${localePlan.reasonCode}).`);
}
