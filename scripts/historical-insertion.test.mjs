import { describe, expect, it } from "vitest";
import { assertHistoricalInsertion, assertHistoricalIdentity, HISTORICAL_INSERTION_REASON } from "./lib/historical-insertion.mjs";
import { applyEditionStateEvent, createEditionState } from "./lib/edition-state.mjs";
import { buildEdition } from "./lib/edition-publisher.mjs";
const id = "2026-09-28-daily";
const sha = "1".repeat(40);
const submission = "2".repeat(40);
const insertion = { issueNumber: 51, latestEditionId: "2026-10-01-daily" };
const manifest = { latest: insertion.latestEditionId, editions: [
  { id: "2026-09-27-daily", issueNumber: 47 }, { id: insertion.latestEditionId, issueNumber: 50 }
] };
function failed() {
  let state = applyEditionStateEvent(createEditionState(id), "packet-ready", { packetBlobSha: sha });
  state = applyEditionStateEvent(state, "editorial-timeout");
  return applyEditionStateEvent(state, "publication-failed", { error: "fallback failed" });
}
function params(state = failed()) { return { manifest, editionId: id, insertion, state, packetBlobSha: sha }; }
describe("authorized historical missing insertion", () => {
  it("requires exact packet, failed timeout and unchanged latest and next issue", () => {
    expect(() => assertHistoricalInsertion(params())).not.toThrow();
    expect(() => assertHistoricalInsertion({ ...params(), packetBlobSha: "3".repeat(40) })).toThrow(/packet/);
    expect(() => assertHistoricalInsertion({ ...params(), state: { ...failed(), editorial: { status: "pending" } } })).toThrow(/timeout/);
    expect(() => assertHistoricalInsertion({ ...params(), insertion: { ...insertion, issueNumber: 48 } })).toThrow(/next issue/);
    expect(() => assertHistoricalInsertion({ ...params(), manifest: { ...manifest, latest: "2026-10-02-daily" } })).toThrow(/latest identity/);
    expect(() => assertHistoricalIdentity({ manifest: { latest: id, editions: [{ id, issueNumber: 51 }] }, editionId: id, insertion: { ...insertion, latestEditionId: id } })).toThrow(/later published/);
  });
  it("records distinct authorization and requires the exact validated submission for publication", () => {
    let state = applyEditionStateEvent(failed(), "editorial-submitted", { packetBlobSha: sha, submissionSha: submission, reason: HISTORICAL_INSERTION_REASON });
    expect(state.transitions.at(-1).reason).toBe(HISTORICAL_INSERTION_REASON);
    expect(() => assertHistoricalInsertion({ ...params(state), phase: "publication" })).toThrow(/validated/);
    state = applyEditionStateEvent(state, "editorial-valid", { packetBlobSha: sha, submissionSha: submission });
    expect(() => assertHistoricalInsertion({ ...params(state), phase: "publication" })).not.toThrow();
    expect(() => assertHistoricalInsertion({ ...params({ ...state, transitions: [] }), phase: "publication" })).toThrow(/authorized/);
    expect(() => assertHistoricalInsertion({ ...params({ ...state, editorial: { ...state.editorial, submissionSha: "4".repeat(40) } }), phase: "publication" })).toThrow(/authorized/);
  });
  it("retains existing issue allocations and latest while appending the supplement", () => {
    const packet = { editorialInput: { window: { id, period: "daily", plannedAt: "2026-09-28 12:00", windowStart: "2026-09-27 10:10", windowEnd: "2026-09-28 10:10" }, packages: [{ eventKey: "one", sources: [{ sourceIndex: 0, kind: "secondary", label: "Media", url: "https://example.com/news" }] }] } };
    const editorial = { editionId: id, archiveTitle: "日报｜《Example》公布合作新作", leadEventKey: "one", decisions: [{ eventKey: "one", decision: "include", section: "news", titleKey: "example", titleEn: "Example", titleZhStatus: "unavailable", headline: "《Example》公布合作新作", summary: "开发商公布合作玩法。", factStatus: "media_report", timeStatus: "verified", tracking: false, platforms: [], entryFlags: [], sourceIndexes: [0], additionalSources: [] }], upcomingMode: "inherit_and_patch", upcoming: [], removeUpcomingIds: [], checkedExtra: [], limitedExtra: [], editorialNote: "original packet" };
    const original = structuredClone(manifest);
    const result = buildEdition({ packet, editorial, latest: { id: "2026-09-27-daily", upcoming: [] }, manifest, historicalInsertion: insertion });
    expect(result.edition).toMatchObject({ id, issueNumber: 51, windowStart: "2026-09-27 10:10", windowEnd: "2026-09-28 10:10" });
    expect(result.manifest.latest).toBe(insertion.latestEditionId);
    expect(result.manifest.editions.slice(0, -1)).toEqual(original.editions);
    expect(manifest).toEqual(original);
    const futurePacket = structuredClone(packet); futurePacket.editorialInput.window = { ...packet.editorialInput.window, id: "2026-10-02-daily", plannedAt: "2026-10-02 12:00" };
    const future = buildEdition({ packet: futurePacket, editorial: { ...editorial, editionId: "2026-10-02-daily" }, latest: { id: insertion.latestEditionId, upcoming: [] }, manifest: result.manifest });
    expect(future.edition.issueNumber).toBe(52);
    expect(future.manifest.latest).toBe("2026-10-02-daily");
  });
});

it("selects the next Daily after the current date rather than after the highest historical issue", async () => {
  const { resolveDueEdition } = await import("./resolve-due-edition.mjs");
  const supplemented = { ...manifest, editions: [...manifest.editions.map(item => ({ ...item, date: item.id.slice(0, 10), period: "daily" })), { id, date: "2026-09-28", period: "daily", issueNumber: 51 }] };
  const result = resolveDueEdition({ period: "daily", now: new Date("2026-10-02T03:00:00Z"), manifest: supplemented, purpose: "editorial" });
  expect(result).toMatchObject({ livenessWake: true, window: { id: "2026-10-02-daily" } });
  expect(resolveDueEdition({ period: "daily", now: new Date("2026-10-02T03:00:00Z"), manifest: supplemented, purpose: "packet" }).window.id).toBe("2026-10-02-daily");
});
