import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { applyEditorialFeedback, isEditorialFeedbackEligible, totals } from "./lib/event-ledger.mjs";
import { HISTORICAL_LEDGER_RECOVERY, historicalLedgerRecoveryCases, recoverHistoricalLedger } from "./lib/historical-ledger-recovery.mjs";

function evidence() {
  const snapshots = historicalLedgerRecoveryCases.map(entry => {
    const before = { events: {} }, after = { events: {} };
    for (const key of entry.eventKeys) {
      if (key !== "684598039014ac405e08") before.events[key] = { eventKey: key, editorialState: ["33fd3dbbd241e1b3beb4", "7e909b8a4b13dff2fea0"].includes(key) ? "closed" : "included", lastDecisionEdition: entry.editionId, tracking: { active: false } };
      after.events[key] = { eventKey: key, editorialState: "excluded", lastDecisionEdition: entry.editionId, tracking: { active: key === "684598039014ac405e08" } };
    }
    return { entry, before, after };
  });
  const readGit = async args => {
    if (args[0] === "merge-base") return "";
    for (const { entry, before, after } of snapshots) {
      if (args.at(-1) === entry.feedbackCommit) return entry.beforeCommit;
      if (args.at(-1) === `${entry.beforeCommit}:automation/ledger/events.json`) return JSON.stringify(before);
      if (args.at(-1) === `${entry.feedbackCommit}:automation/ledger/events.json`) return JSON.stringify(after);
    }
    throw new Error("Unexpected provenance lookup");
  };
  const ledger = { schemaVersion: 2, updatedAt: "2026-10-22T19:00:00Z", retentionDays: 45, events: structuredClone(Object.assign({}, ...snapshots.map(s => s.after.events), { legitimate: { editorialState: "included", lastDecisionEdition: "2026-10-17-daily" } })) };
  ledger.totals = totals(ledger.events);
  return { snapshots, ledger, readGit };
}
const run = (ledger, readGit, recoveryId = HISTORICAL_LEDGER_RECOVERY) => recoverHistoricalLedger(ledger, { readGit, recoveryId });

describe("manual overlay feedback boundary", () => {
  it("blocks unbound historical and insertion decisions but allows ordinary latest and new daily feedback", () => {
    expect(isEditorialFeedbackEligible({ editionId: "2026-09-16-daily", latestEditionId: "2026-10-22-daily" })).toBe(false);
    expect(isEditorialFeedbackEligible({ editionId: "2026-10-22-daily", latestEditionId: "2026-10-22-daily" })).toBe(true);
    expect(isEditorialFeedbackEligible({ editionId: "2026-10-23-daily", latestEditionId: "2026-10-22-daily" })).toBe(true);
    expect(isEditorialFeedbackEligible({ editionId: "2026-10-22-daily", latestEditionId: "2026-10-22-daily", historicalInsertion: {} })).toBe(false);
  });
  it("does not apply compact historical excludes to preserved included or closed records", () => {
    const { ledger, snapshots } = evidence();
    const entry = snapshots[0].entry;
    const editorial = { editionId: entry.editionId, decisions: entry.eventKeys.map(eventKey => ({ eventKey, decision: "exclude", reason: "omitted from compact overlay" })) };
    expect(applyEditorialFeedback(ledger, editorial, {}, { latestEditionId: "2026-10-22-daily" })).toBe(ledger);
    const options = { decidedAt: "2026-10-22T20:00:00Z" };
    expect(applyEditorialFeedback(ledger, editorial, {}, { ...options, latestEditionId: entry.editionId })).toEqual(applyEditorialFeedback(ledger, editorial, {}, options));
  });
  it("allows trusted older continuations, including no-include tracking, but suppresses completed manual digest replay", () => {
    const editionId = "2026-10-17-daily", packetBlobSha = "a".repeat(40);
    const state = { editionId, packet: { blobSha: packetBlobSha }, editorial: { packetBlobSha }, revisionRequest: { status: "open", reason: "editorial_continuation" }, transitions: [] };
    const context = { editionId, latestEditionId: "2026-10-22-daily", packetBlobSha, state, decisionIdentity: "normal" };
    expect(isEditorialFeedbackEligible(context)).toBe(true);
    const editorial = { editionId, packetBlobSha, decisions: [{ eventKey: "tracked", decision: "needs_review", tracking: true, reason: "Unresolved subject" }] };
    const options = { latestEditionId: context.latestEditionId, state, decisionIdentity: "normal", decidedAt: "2026-10-22T19:00:00Z" };
    const result = applyEditorialFeedback({ events: {} }, editorial, {}, options);
    expect(result.events.tracked.tracking.active).toBe(true);
    const manualState = { ...state, revisionRequest: { status: "completed", reason: "user_authorized_same_edition_revision" } };
    expect(isEditorialFeedbackEligible({ ...context, state: manualState })).toBe(false);
    state.transitions = [{ event: "revision-opened", reason: "user_authorized_same_edition_revision" }, { event: "publication-committed", packetBlobSha, decisionDigest: "manual" }, { event: "continuation-opened", reason: "editorial_continuation" }];
    expect(isEditorialFeedbackEligible({ ...context, decisionIdentity: "manual" })).toBe(false);
    expect(isEditorialFeedbackEligible(context)).toBe(true);
    expect(isEditorialFeedbackEligible({ ...context, packetBlobSha: "wrong" })).toBe(false);
    expect(isEditorialFeedbackEligible({ ...context, state: { ...state, editionId: "wrong" } })).toBe(false);
  });
  it.each(["open", "completed"])("does not let the latest edition bypass a %s manual overlay", status => {
    const editionId = "2026-10-22-daily", packetBlobSha = "a".repeat(40);
    const state = { editionId, packet: { blobSha: packetBlobSha }, editorial: { packetBlobSha }, revisionRequest: { status, reason: "user_authorized_same_edition_revision" }, transitions: [] };
    const editorial = { editionId, packetBlobSha, decisions: [{ eventKey: "preserved", decision: "exclude", reason: "Compact omission" }, { eventKey: "lead", decision: "include", headline: "Cosmetic correction", tracking: true }] };
    const ledger = { events: { preserved: { editorialState: "included" }, lead: { editorialState: "included", tracking: { active: false } } } };
    const options = { latestEditionId: editionId, state, decisionIdentity: "manual", decidedAt: "2026-10-22T20:00:00Z" };
    expect(applyEditorialFeedback(ledger, editorial, {}, options)).toBe(ledger);
    state.revisionRequest = { status: "open", reason: "editorial_continuation" };
    expect(applyEditorialFeedback(ledger, editorial, {}, options)).not.toBe(ledger);
    state.transitions = [{ event: "revision-opened", reason: "user_authorized_same_edition_revision" }, { event: "publication-committed", packetBlobSha, decisionDigest: "manual" }, { event: "continuation-opened", reason: "editorial_continuation" }];
    expect(applyEditorialFeedback(ledger, editorial, {}, options)).toBe(ledger);
    expect(applyEditorialFeedback(ledger, editorial, {}, { ...options, decisionIdentity: "normal-continuation" })).not.toBe(ledger);
  });
  it("covers publication, digest replay and empty-continuation results without blocking English replay", async () => {
    const script = await readFile("scripts/publish-editorial-decision.mjs", "utf8");
    expect(script.match(/feedbackEligible: feedbackAllowed/g)).toHaveLength(2);
    expect(script).toContain("const feedbackEligible = feedbackAllowed && matchingDecision;");
    expect(script).toContain("if (matchingDecision && editorial.locales?.en)");
    expect(script.indexOf("const feedbackAllowed")).toBeLessThan(script.indexOf("if (noOpNewsContinuation)"));
  });
});

describe("fixed historical ledger delta recovery", () => {
  it("restores only 26 proven records, including removal of a recreated tracking record, and is idempotent", async () => {
    const { ledger, readGit, snapshots } = evidence();
    const result = await run(ledger, readGit);
    expect(result.report.filter(r => r.status === "restored")).toHaveLength(26);
    for (const { before, entry } of snapshots) for (const key of entry.eventKeys) expect(result.ledger.events[key]).toEqual(before.events[key]);
    expect(result.ledger.events.legitimate).toEqual(ledger.events.legitimate);
    expect(result.ledger.updatedAt).toBe(ledger.updatedAt);
    expect(result.ledger.totals).toEqual(totals(result.ledger.events));
    expect((await run(result.ledger, readGit)).ledger).toBe(result.ledger);
  });
  it("preserves any newer concurrent update, including an updated newly-created record", async () => {
    const { ledger, readGit, snapshots } = evidence();
    const keys = ["684598039014ac405e08", snapshots[0].entry.eventKeys[0]];
    keys.forEach(key => { ledger.events[key].newer = true; });
    const result = await run(ledger, readGit);
    keys.forEach(key => expect(result.ledger.events[key]).toEqual(ledger.events[key]));
    expect(result.report.filter(r => r.status === "preserved-concurrent-change")).toHaveLength(2);
  });
  it("fails closed on unknown recovery, wrong parent, non-ancestor, missing evidence and wrong edition", async () => {
    const { ledger, readGit, snapshots } = evidence();
    await expect(run(ledger, readGit, "arbitrary-override")).rejects.toThrow("Unknown");
    await expect(run(ledger, async args => args.includes("--format=%P") ? "wrong" : readGit(args))).rejects.toThrow("parent");
    await expect(run(ledger, async args => { if (args[0] === "merge-base") throw new Error("not ancestor"); return readGit(args); })).rejects.toThrow("ancestor");
    await expect(run(ledger, async args => args.at(-1).includes(":") ? "{}" : readGit(args))).rejects.toThrow("missing evidence");
    snapshots[0].after.events[snapshots[0].entry.eventKeys[0]].lastDecisionEdition = "2026-10-22-daily";
    await expect(run(ledger, readGit)).rejects.toThrow("provenance mismatch");
  });
  it("keeps routine publication independent of incident snapshots without coupling feedback to queue advancement", async () => {
    const workflow = await readFile(".github/workflows/publish-editorial-decision.yml", "utf8");
    const feedbackStep = workflow.split("- name: Write editorial outcomes to persistent ledger")[1].split("- name:")[0];
    expect(feedbackStep).toContain("steps.publication.outcome == 'success'");
    expect(feedbackStep).toContain("bash scripts/write-editorial-feedback-branch.sh");
    expect(feedbackStep).toContain("FEEDBACK_ELIGIBLE:");
    expect(workflow).not.toContain("recover-historical-ledger");
    const writer = await readFile("scripts/write-editorial-feedback-branch.sh", "utf8");
    expect(writer).toContain('if [ "${FEEDBACK_ELIGIBLE:-}" = "true" ]; then');
    expect(writer).not.toContain("HISTORICAL_LEDGER_RECOVERY");
    expect(workflow).not.toContain("HISTORICAL_LEDGER_RECOVERY");
    const feedbackBlock = writer.split('if [ "${FEEDBACK_ELIGIBLE:-}" = "true" ]; then')[1].split("  fi")[0];
    expect(feedbackBlock).not.toContain("advance-showcase-queue");
    expect(writer).toContain('  fi\n  node scripts/advance-showcase-queue.mjs');
    expect(writer).toContain("push origin HEAD:automation/state");
    expect(writer).not.toContain("--force");
  });
});
