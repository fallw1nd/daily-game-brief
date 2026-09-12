import { describe, expect, it } from "vitest";
import { advanceEditorialQueue } from "./lib/editorial-queue.mjs";
import { applyEditionStateEvent, createEditionState, gitBlobSha } from "./lib/edition-state.mjs";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";

const editionId = "2026-09-11-daily";
const window = expectedEditorialWindow(editionId);

function publishedState() {
  let state = createEditionState(editionId, "2026-09-11T04:00:00.000Z");
  state = applyEditionStateEvent(state, "packet-ready", { packetBlobSha: "1".repeat(40) });
  state = applyEditionStateEvent(state, "editorial-submitted", { packetBlobSha: "1".repeat(40), submissionSha: "2".repeat(40) });
  state = applyEditionStateEvent(state, "editorial-valid", { packetBlobSha: "1".repeat(40), submissionSha: "2".repeat(40) });
  return applyEditionStateEvent(state, "publication-committed", { mainSha: "3".repeat(40), source: "editorial" });
}

function packet(eventKeys, scope = "news", overrides = {}) {
  return JSON.stringify({
    schemaVersion: 3,
    mode: "chatgpt-handoff",
    finalizedAt: "2026-09-11T04:00:00.000Z",
    coverageThrough: window.windowEnd,
    outputSchema: {},
    continuation: { scope, preservePublished: true },
    editorialInput: {
      schemaVersion: 2,
      window,
      trackingQueue: [],
      packages: eventKeys.map(eventKey => ({ eventKey, ...(scope === "showcase" ? { showcaseRefs: [{ showcaseId: "direct", announcementId: eventKey }] } : {}) })),
      ...overrides,
    },
  });
}

function queueFixture() {
  const first = packet(["news-1"]);
  const second = packet(["news-2"]);
  return {
    state: publishedState(),
    canonical: { id: editionId, entries: [] },
    queue: {
      schemaVersion: 1,
      editionId,
      totalAnnouncements: 0,
      batches: [
        { name: "news-1.json", scope: "news", status: "pending", eventKeys: ["news-1"] },
        { name: "news-2.json", scope: "news", status: "pending", eventKeys: ["news-2"] },
      ],
    },
    packets: { "news-1.json": first, "news-2.json": second },
  };
}

function publishContinuation(state, packetText, mainSha) {
  const packetSha = gitBlobSha(packetText);
  let next = applyEditionStateEvent(state, "editorial-submitted", { packetBlobSha: packetSha, submissionSha: `${mainSha.slice(0, 39)}1` });
  next = applyEditionStateEvent(next, "editorial-valid", { packetBlobSha: packetSha, submissionSha: `${mainSha.slice(0, 39)}1` });
  return applyEditionStateEvent(next, "publication-committed", { mainSha, source: "editorial" });
}

describe("durable editorial continuation queue", () => {
  it("activates one exact news batch, then advances to the final batch after publication", () => {
    const input = queueFixture();
    const first = advanceEditorialQueue(input);
    expect(first.batch).toMatchObject({ name: "news-1.json", scope: "news", status: "editing" });
    expect(first.state.revisionRequest).toMatchObject({
      status: "open",
      reason: "editorial_continuation",
      batchName: "news-1.json",
      batchScope: "news",
      eventKeys: ["news-1"],
    });

    const firstPublished = publishContinuation(first.state, first.packet, "4".repeat(40));
    const second = advanceEditorialQueue({ ...input, queue: first.queue, state: firstPublished });
    expect(second.batch).toMatchObject({ name: "news-2.json", scope: "news", status: "editing" });
    expect(second.queue.batches[0].status).toBe("completed");
    expect(second.state.revisionRequest).toMatchObject({ batchName: "news-2.json", eventKeys: ["news-2"] });

    const duplicate = advanceEditorialQueue({ ...input, queue: second.queue, state: second.state });
    expect(duplicate.packet).toBeNull();
    expect(duplicate.queue.batches[1].status).toBe("editing");

    const secondPublished = publishContinuation(second.state, second.packet, "5".repeat(40));
    const done = advanceEditorialQueue({ ...input, queue: second.queue, state: secondPublished });
    expect(done.packet).toBeNull();
    expect(done.queue.batches.every(batch => batch.status === "completed")).toBe(true);
  });

  it("fails closed for missing, empty, cross-window, and scope-spoofed packets", () => {
    const input = queueFixture();
    expect(() => advanceEditorialQueue({ ...input, packets: {} })).toThrow("missing durable editorial batch");
    expect(() => advanceEditorialQueue({
      ...input,
      packets: { ...input.packets, "news-1.json": packet([], "news") },
    })).toThrow("must contain at least one package");
    const wrongWindow = JSON.parse(input.packets["news-1.json"]);
    wrongWindow.editorialInput.window = { ...window, windowEnd: "2026-09-12 10:10" };
    expect(() => advanceEditorialQueue({
      ...input,
      packets: { ...input.packets, "news-1.json": JSON.stringify(wrongWindow) },
    })).toThrow("packet window windowEnd");
    expect(() => advanceEditorialQueue({
      ...input,
      packets: { ...input.packets, "news-1.json": packet(["news-1"], "showcase") },
    })).toThrow("invalid continuation scope");
    const ordinaryShowcase = JSON.parse(input.packets["news-1.json"]);
    ordinaryShowcase.editorialInput.packages[0].showcaseRefs = [{ showcaseId: "direct", announcementId: "news-1" }];
    expect(() => advanceEditorialQueue({
      ...input,
      packets: { ...input.packets, "news-1.json": JSON.stringify(ordinaryShowcase) },
    })).toThrow("cannot contain showcase references");
  });

  it("does not consume a continuation while a manual revision is open or for another edition", () => {
    const input = queueFixture();
    const manual = applyEditionStateEvent(input.state, "revision-opened", { reason: "user_authorized_same_edition_revision" });
    const blocked = advanceEditorialQueue({ ...input, state: manual });
    expect(blocked.packet).toBeNull();
    expect(blocked.state).toEqual(manual);
    expect(() => advanceEditorialQueue({ ...input, canonical: { id: "2026-09-10-daily", entries: [] } })).toThrow("same current edition");
  });

  it("prioritizes a Canonical news continuation over a pending showcase batch", () => {
    const input = queueFixture();
    input.queue.batches = [
      { name: "showcase-1.json", scope: "showcase", status: "pending", eventKeys: ["showcase-1"] },
      ...input.queue.batches,
    ];
    input.packets["showcase-1.json"] = packet(["showcase-1"], "showcase");
    const result = advanceEditorialQueue(input);
    expect(result.batch).toMatchObject({ name: "news-1.json", scope: "news" });
  });

  it("does not treat a showcase batch as a news continuation", () => {
    const input = queueFixture();
    input.queue.batches = [{ name: "showcase-1.json", scope: "showcase", status: "pending", eventKeys: ["showcase-1"] }];
    input.queue.totalAnnouncements = 1;
    input.packets = { "showcase-1.json": packet(["showcase-1"], "showcase") };
    const result = advanceEditorialQueue(input);
    expect(result.state.revisionRequest).toMatchObject({ reason: "showcase_completion", announcementIds: ["showcase-1"] });
    expect(result.state.revisionRequest).not.toHaveProperty("batchScope", "news");
  });
});
