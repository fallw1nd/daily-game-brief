import { describe, expect, it } from "vitest";
import { advanceShowcaseQueue } from "./lib/showcase-queue.mjs";
import { createEditionState, applyEditionStateEvent } from "./lib/edition-state.mjs";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";

const editionId = "2026-09-10-daily";
function fixture() {
  let state = createEditionState(editionId);
  state = applyEditionStateEvent(state, "packet-ready", { packetBlobSha: "1".repeat(40) });
  state = applyEditionStateEvent(state, "editorial-timeout", { packetBlobSha: "1".repeat(40) });
  state = applyEditionStateEvent(state, "publication-committed", { mainSha: "2".repeat(40), source: "degraded", at: "2026-09-10T04:00:00Z" });
  const window = expectedEditorialWindow(editionId);
  const packet = JSON.stringify({ schemaVersion: 3, mode: "chatgpt-handoff", finalizedAt: "2026-09-10T04:00:00Z", coverageThrough: window.windowEnd, outputSchema: {}, continuation: { scope: "showcase", preservePublished: true }, editorialInput: { schemaVersion: 2, window, trackingQueue: [], packages: [{ eventKey: "announcement", showcaseRefs: [{ showcaseId: "direct", announcementId: "announcement" }] }] } });
  return { state, queue: { editionId, totalAnnouncements: 1, batches: [{ name: "batch.json", scope: "showcase", status: "pending", eventKeys: ["announcement"] }] }, canonical: { id: editionId, entries: [] }, packets: { "batch.json": packet } };
}
describe("durable showcase queue", () => {
  it("retries unresolved initial announcements at 30 minutes without rewriting the window", () => {
    const input = fixture();
    input.queue.batches[0].status = "awaiting_retry";
    const early = advanceShowcaseQueue({ ...input, now: "2026-09-10T04:29:59Z" });
    expect(early.packet).toBeNull();
    const due = advanceShowcaseQueue({ ...input, queue: early.queue, now: "2026-09-10T04:30:00Z" });
    expect(due.packet).toBe(input.packets["batch.json"]);
    expect(due.queue.batches[0].retryAttempts).toBe(1);
    expect(due.state.fixedWindow).toEqual(input.state.fixedWindow);
  });
  it("opens exactly one scoped packet and repeated advancement leaves it in flight", () => {
    const input = fixture();
    const result = advanceShowcaseQueue(input);
    expect(result.state.revisionRequest).toMatchObject({ reason: "showcase_completion", announcementIds: ["announcement"] });
    expect(result.queue.batches[0].status).toBe("editing");
    expect(advanceShowcaseQueue({ ...input, ...result }).packet).toBeNull();
  });
  it("does not overwrite an open manual revision", () => {
    const input = fixture();
    input.state = applyEditionStateEvent(input.state, "revision-opened", { reason: "user_authorized_same_edition_revision" });
    const result = advanceShowcaseQueue(input);
    expect(result.packet).toBeNull();
    expect(result.state).toEqual(input.state);
  });
  it("accounts by announcement identity and refuses a different edition", () => {
    const input = fixture();
    input.canonical.entries = [{ showcaseRefs: [{ showcaseId: "direct", announcementId: "announcement" }] }];
    expect(advanceShowcaseQueue(input).queue.remainingAnnouncements).toBe(0);
    expect(advanceShowcaseQueue(input).queue.batches[0].status).toBe("completed");
    expect(() => advanceShowcaseQueue({ ...input, canonical: { id: "2026-09-11-daily" } })).toThrow("same current edition");
  });
  it("rejects a packet from a different time window", () => {
    const input = fixture();
    const packet = JSON.parse(input.packets["batch.json"]);
    packet.editorialInput.window.windowEnd = "2026-09-11 10:10";
    input.packets["batch.json"] = JSON.stringify(packet);
    expect(() => advanceShowcaseQueue(input)).toThrow("windowEnd");
  });
});
