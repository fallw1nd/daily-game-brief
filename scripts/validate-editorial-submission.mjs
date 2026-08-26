import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertEditorialSubmission } from "./lib/editorial-submission.mjs";

const PACKET_PATH = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");
const DECISION_PATH = resolve(process.env.EDITORIAL_DECISION_PATH || "artifacts/editorial-decisions.json");
const branchName = process.env.EDITORIAL_BRANCH || process.env.GITHUB_REF_NAME;
const [packet, editorial] = await Promise.all([
  readFile(PACKET_PATH, "utf8").then((text) => JSON.parse(text)),
  readFile(DECISION_PATH, "utf8").then((text) => JSON.parse(text)),
]);
assertEditorialSubmission({ branchName, packet, editorial });
console.log(`Validated editorial submission ${editorial.editionId} from ${branchName}.`);
