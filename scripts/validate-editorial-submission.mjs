import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gitBlobSha } from "./lib/edition-state.mjs";
import { validateEditorialSubmission } from "./lib/editorial-submission.mjs";

const PACKET_PATH = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");
const DECISION_PATH = resolve(process.env.EDITORIAL_DECISION_PATH || "artifacts/editorial-decisions.json");
const RESULT_PATH = resolve(process.env.EDITORIAL_VALIDATION_PATH || "artifacts/editorial-validation.json");
const branchName = process.env.EDITORIAL_BRANCH || process.env.GITHUB_REF_NAME;
const [packetText, editorial] = await Promise.all([readFile(PACKET_PATH, "utf8"), readFile(DECISION_PATH, "utf8").then((text) => JSON.parse(text))]);
const packet = JSON.parse(packetText);
const packetBlobSha = gitBlobSha(packetText);
const errors = validateEditorialSubmission({ branchName, packet, editorial, packetBlobSha, publicationMode: process.env.PUBLICATION_MODE || "publish" });
await mkdir(dirname(RESULT_PATH), { recursive: true });
await writeFile(RESULT_PATH, JSON.stringify({ schemaVersion: 1, editionId: editorial?.editionId || null, packetBlobSha, valid: errors.length === 0, errors }, null, 2) + "\n");
if (errors.length) throw new Error(`Editorial submission is invalid:\n- ${errors.join("\n- ")}`);
console.log(`Validated editorial submission ${editorial.editionId} from ${branchName}.`);
