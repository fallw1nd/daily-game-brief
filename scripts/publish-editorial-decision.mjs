import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { buildEdition } from "./lib/edition-publisher.mjs";
import { validateEditorialOutput } from "./lib/editorial-contract.mjs";

const run = promisify(execFile);
const PACKET_PATH = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");
const DECISION_PATH = resolve(process.env.EDITORIAL_DECISION_PATH || "artifacts/editorial-decisions.json");
const RESULT_PATH = resolve(process.env.PUBLICATION_RESULT_PATH || "artifacts/publication-result.json");
const packet = JSON.parse(await readFile(PACKET_PATH, "utf8"));
const editorial = JSON.parse(await readFile(DECISION_PATH, "utf8"));
const [latest, manifest] = await Promise.all([
  readFile("public/data/latest.json", "utf8").then((text) => JSON.parse(text)),
  readFile("public/data/manifest.json", "utf8").then((text) => JSON.parse(text)),
]);
const contractErrors = validateEditorialOutput(editorial, packet.editorialInput);
if (contractErrors.length) throw new Error(`Editorial decisions failed evidence validation:\n- ${contractErrors.join("\n- ")}`);
const now = process.env.BRIEF_NOW ? new Date(process.env.BRIEF_NOW) : new Date();
const result = buildEdition({ packet, editorial, latest, manifest, now });
if (result.status === "already-exists") {
  const manifestItem = manifest.editions.find((item) => item.id === editorial.editionId);
  const existingEdition = manifestItem
    ? JSON.parse(await readFile(resolve("public/data", manifestItem.path), "utf8"))
    : null;
  const feedbackEligible = existingEdition?.sourceReport?.editorialDecisionDigest === result.decisionDigest;
  await mkdir(dirname(RESULT_PATH), { recursive: true });
  await writeFile(RESULT_PATH, JSON.stringify({
    editionId: editorial.editionId,
    status: result.status,
    decisionDigest: result.decisionDigest,
    feedbackEligible,
  }, null, 2) + "\n");
  console.log(`${editorial.editionId} already exists; no files changed.`);
  process.exit(0);
}
const archiveFile = resolve("public/data", result.archivePath);
await mkdir(dirname(archiveFile), { recursive: true });
const editionText = JSON.stringify(result.edition, null, 2) + "\n";
await Promise.all([
  writeFile(archiveFile, editionText),
  writeFile("public/data/latest.json", editionText),
  writeFile("public/data/manifest.json", JSON.stringify(result.manifest, null, 2) + "\n"),
]);
await run(process.execPath, ["scripts/build-search-index.mjs"]);
await mkdir(dirname(RESULT_PATH), { recursive: true });
await writeFile(RESULT_PATH, JSON.stringify({
  editionId: editorial.editionId,
  status: result.status,
  decisionDigest: result.decisionDigest,
  feedbackEligible: true,
}, null, 2) + "\n");
console.log(`${result.status === "revised" ? "Revised" : "Built"} ${result.edition.id} issue ${result.edition.issueNumber}: ${result.archivePath}`);
