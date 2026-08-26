import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { updateLedger } from "./lib/event-ledger.mjs";

const CANDIDATES_PATH = resolve(process.env.NEWS_CANDIDATES_PATH || "artifacts/news-candidates.json");
const PREVIOUS_PATH = resolve(process.env.EVENT_LEDGER_PREVIOUS_PATH || "artifacts/event-ledger-previous.json");
const OUTPUT_PATH = resolve(process.env.EVENT_LEDGER_PATH || "artifacts/event-ledger.json");
const MAX_EVENTS = Number(process.env.EVENT_LEDGER_MAX_EVENTS || 5000);
const RETENTION_DAYS = Number(process.env.EVENT_LEDGER_RETENTION_DAYS || 45);

const snapshot = JSON.parse(await readFile(CANDIDATES_PATH, "utf8"));
let previous = { schemaVersion: 1, events: {} };
try { previous = JSON.parse(await readFile(PREVIOUS_PATH, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const ledger = updateLedger(snapshot, previous, { retentionDays: RETENTION_DAYS, maxEvents: MAX_EVENTS });
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(ledger, null, 2) + "\n");
console.log(`Event ledger: ${ledger.totals.events} events; recurring=${ledger.totals.recurring}`);
