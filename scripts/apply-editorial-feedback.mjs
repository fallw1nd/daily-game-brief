import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { applyEditorialFeedback } from "./lib/event-ledger.mjs";

const LEDGER_PATH = resolve(process.env.EVENT_LEDGER_PATH || "artifacts/event-ledger.json");
const DECISION_PATH = resolve(process.env.EDITORIAL_DECISION_PATH || "artifacts/editorial-decisions.json");
const PACKET_PATH = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");

let ledger = { schemaVersion: 2, retentionDays: 45, events: {} };
try { ledger = JSON.parse(await readFile(LEDGER_PATH, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const [editorial, packet] = await Promise.all([
  readFile(DECISION_PATH, "utf8").then((text) => JSON.parse(text)),
  readFile(PACKET_PATH, "utf8").then((text) => JSON.parse(text)),
]);
if (packet?.editorialInput?.window?.id !== editorial.editionId) {
  throw new Error("editorial decision and packet edition IDs do not match");
}
const updated = applyEditorialFeedback(ledger, editorial, packet, {
  decidedAt: process.env.EDITORIAL_DECIDED_AT || new Date().toISOString(),
});
await mkdir(dirname(LEDGER_PATH), { recursive: true });
await writeFile(LEDGER_PATH, JSON.stringify(updated, null, 2) + "\n");
console.log(`Editorial ledger feedback: ${editorial.editionId}; decisions=${editorial.decisions.length}; tracking=${updated.totals.tracking}`);
