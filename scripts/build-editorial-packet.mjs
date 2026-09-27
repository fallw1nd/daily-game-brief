import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildEditorialLedgerView } from "./lib/editorial-ledger-view.mjs";

const evidencePath = resolve(process.env.NEWS_EVIDENCE_PATH || "artifacts/news-evidence.json");
const ledgerPath = resolve(process.env.EVENT_LEDGER_PATH || "artifacts/event-ledger.json");
const viewPath = resolve(process.env.EDITORIAL_LEDGER_VIEW_PATH || "artifacts/editorial-ledger-input.json");

let ledger = null;
try {
  ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (ledger) {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const { ledger: view, metrics } = buildEditorialLedgerView(ledger, evidence);
  await mkdir(dirname(viewPath), { recursive: true });
  await writeFile(viewPath, JSON.stringify(view, null, 2) + "\n");
  process.env.EVENT_LEDGER_PATH = viewPath;
  console.log(`Editorial tracking view: ${metrics.queuedActiveTracking}/${metrics.totalActiveTracking} active tracking items queued; ${metrics.suppressedNoNewEvidence} unchanged reminders preserved in ledger but omitted from this packet.`);
}

await import("./editorialize.mjs");
