import { execFileSync } from "node:child_process";
import { recoverHistoricalLedger } from "./lib/historical-ledger-recovery.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { applyEditorialFeedback } from "./lib/event-ledger.mjs";
import { editorialDecisionDigest } from "./lib/locale-digest.mjs";

const LEDGER_PATH = resolve(process.env.EVENT_LEDGER_PATH || "artifacts/event-ledger.json");
const DECISION_PATH = resolve(process.env.EDITORIAL_DECISION_PATH || "artifacts/editorial-decisions.json");
const PACKET_PATH = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");

let ledger = { schemaVersion: 2, retentionDays: 45, events: {} };
try { ledger = JSON.parse(await readFile(LEDGER_PATH, "utf8")); } catch (error) {
  if (error.code !== "ENOENT" || process.env.HISTORICAL_LEDGER_RECOVERY) throw error;
}
if (process.env.HISTORICAL_LEDGER_RECOVERY) {
  if (!process.env.LEDGER_STATE_ROOT) throw new Error("Historical ledger recovery requires the current state worktree");
  const result = await recoverHistoricalLedger(ledger, {
    recoveryId: process.env.HISTORICAL_LEDGER_RECOVERY,
    readGit: (args) => execFileSync("git", args, { cwd: process.env.LEDGER_STATE_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }),
  });
  await writeFile(LEDGER_PATH, JSON.stringify(result.ledger, null, 2) + "\n");
  console.log(JSON.stringify({ recovery: process.env.HISTORICAL_LEDGER_RECOVERY, report: result.report }, null, 2));
  process.exit(0);
}
const [editorial, packet] = await Promise.all([
  readFile(DECISION_PATH, "utf8").then((text) => JSON.parse(text)),
  readFile(PACKET_PATH, "utf8").then((text) => JSON.parse(text)),
]);
if (packet?.editorialInput?.window?.id !== editorial.editionId) {
  throw new Error("editorial decision and packet edition IDs do not match");
}
const latest = JSON.parse(await readFile("public/data/latest.json", "utf8"));
if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}-(am|pm|daily)$/.test(latest.id || "")) throw new Error("Missing current Canonical edition identity for ledger feedback");
let state = null;
try { state = JSON.parse(await readFile(resolve(dirname(LEDGER_PATH), "../status", `${editorial.editionId}.json`), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const updated = applyEditorialFeedback(ledger, editorial, packet, {
  latestEditionId: latest.id,
  state,
  decidedAt: process.env.EDITORIAL_DECIDED_AT || new Date().toISOString(),
  decisionIdentity: process.env.EDITORIAL_DECISION_IDENTITY || editorialDecisionDigest(editorial),
});
await mkdir(dirname(LEDGER_PATH), { recursive: true });
await writeFile(LEDGER_PATH, JSON.stringify(updated, null, 2) + "\n");
console.log(`Editorial ledger feedback: ${editorial.editionId}; decisions=${editorial.decisions.length}; tracking=${updated.totals.tracking}`);
