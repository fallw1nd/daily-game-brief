import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { applyEditorialFeedback } from "./lib/event-ledger.mjs";

const bundle = JSON.parse(await readFile(process.env.EDITORIAL_BUNDLE_PATH, "utf8"));
const packetDir = process.env.EDITORIAL_BUNDLE_PACKET_DIR;
const ledgerPath = process.env.EVENT_LEDGER_PATH;
let ledger = { schemaVersion: 2, retentionDays: 45, events: {} };
try { ledger = JSON.parse(await readFile(ledgerPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const requestedIndex = process.env.EDITORIAL_BUNDLE_ONLY_INDEX == null ? null : Number(process.env.EDITORIAL_BUNDLE_ONLY_INDEX);
const submissions = requestedIndex == null
  ? bundle.submissions || []
  : (bundle.submissions || []).filter(submission => submission.index === requestedIndex);
if (requestedIndex != null && submissions.length !== 1) throw new Error(`bundle feedback index ${requestedIndex} is not present exactly once`);
for (const submission of submissions) {
  const packet = JSON.parse(await readFile(`${packetDir}/${submission.packetBlobSha}.json`, "utf8"));
  ledger = applyEditorialFeedback(ledger, submission.editorial, packet, {
    decidedAt: process.env.EDITORIAL_DECIDED_AT || new Date().toISOString(),
  });
}
await mkdir(dirname(ledgerPath), { recursive: true });
await writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
console.log(`Editorial bundle ledger feedback: ${bundle.editionId}; submissions=${bundle.submissions?.length || 0}`);
