import { isDeepStrictEqual } from "node:util";
import { totals } from "./event-ledger.mjs";

// Fixed incident only, not an operator-supplied ledger overwrite interface.
export const HISTORICAL_LEDGER_RECOVERY = "historical-overlay-2026-10-22";
export const historicalLedgerRecoveryCases = [
  {
    editionId: "2026-09-16-daily",
    beforeCommit: "db90b57bad8d8c3fccf1cdbb779d2352b70a07a5",
    feedbackCommit: "d32b8375657c74ce1eaefd42d87a8250fee1b6e0",
    eventKeys: ["51eb82dc6ea46a4a750e", "1f8d17d3225b465ebaf9", "944413a93975ed522291", "a804e8e85e0d7b050649", "438b1ae2b6a917b3798a", "848d005aa8258a091316", "1e94020803c4a4ef59a3", "f45de756b8b5a6d2b2bf", "1940f30838d3fcbd7a92", "2935406c898e62c99dcc", "03df0bdb78c653951920", "684598039014ac405e08"],
  },
  {
    editionId: "2026-09-20-daily",
    beforeCommit: "55b7fd49d2a1409077565cba151bfde85f2c04c4",
    feedbackCommit: "85892f03d1ef9f5c37a220c67a134f7bbe530c19",
    eventKeys: ["33fd3dbbd241e1b3beb4", "d1d0dfb9dc40c9674bbb", "9d62814b87a60854f809", "61d0a09fed56783c2107", "7e909b8a4b13dff2fea0", "09ed480596e21e7af283", "edc31b019d84bd27af5a", "6f05d8b5676a4a4651bc", "0c593dab82ce1e924799", "3c95a4e1801bbf4e3a9f", "b4d8137b60dc194196b5", "0cd42d7eba844ce00a8d", "227f4df9373d4b89afbf", "277ef1f345e503a2fa92"],
  },
];

export async function recoverHistoricalLedger(ledger, { recoveryId, readGit }) {
  if (recoveryId !== HISTORICAL_LEDGER_RECOVERY) throw new Error("Unknown historical ledger recovery");
  // Validate all provenance before preparing any mutation. Commit contents are
  // loaded by exact Git object IDs, never from a caller-provided patch/file.
  const snapshots = [];
  for (const entry of historicalLedgerRecoveryCases) {
    const parents = (await readGit(["show", "-s", "--format=%P", entry.feedbackCommit])).trim();
    if (parents !== entry.beforeCommit) throw new Error("Historical ledger recovery parent mismatch");
    await readGit(["merge-base", "--is-ancestor", entry.feedbackCommit, "HEAD"]);
    const before = JSON.parse(await readGit(["show", `${entry.beforeCommit}:automation/ledger/events.json`]));
    const after = JSON.parse(await readGit(["show", `${entry.feedbackCommit}:automation/ledger/events.json`]));
    if (!before.events || !after.events || !entry.eventKeys.length) throw new Error("Historical ledger recovery missing evidence");
    for (const key of entry.eventKeys) {
      if (!Object.hasOwn(after.events, key) || isDeepStrictEqual(before.events[key], after.events[key]) ||
          after.events[key].lastDecisionEdition !== entry.editionId) {
        throw new Error(`Historical ledger recovery event provenance mismatch: ${key}`);
      }
    }
    snapshots.push({ entry, before, after });
  }
  const events = structuredClone(ledger.events);
  const report = [];
  let changed = false;
  for (const { entry, before, after } of snapshots) {
    for (const key of entry.eventKeys) {
      let status;
      if (isDeepStrictEqual(events[key], before.events[key])) {
        status = "already-restored";
      } else if (!isDeepStrictEqual(events[key], after.events[key])) {
        status = "preserved-concurrent-change";
      } else {
        if (Object.hasOwn(before.events, key)) events[key] = structuredClone(before.events[key]);
        else delete events[key];
        status = "restored";
        changed = true;
      }
      report.push({ editionId: entry.editionId, eventKey: key, status });
    }
  }
  // Keep the current clock/retention metadata, not the historical snapshot's.
  return { ledger: changed ? { ...ledger, events, totals: totals(events) } : ledger, report };
}
