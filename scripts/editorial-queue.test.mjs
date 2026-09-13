import { describe, expect, it } from "vitest";
import { advanceEditorialQueue } from "./lib/editorial-queue.mjs";
import { applyEditionStateEvent, createEditionState, gitBlobSha } from "./lib/edition-state.mjs";
import { buildEdition } from "./lib/edition-publisher.mjs";
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

const source = { sourceIndex: 0, status: "opened", kind: "primary", independenceKey: "publisher", label: "Publisher", url: "https://publisher.example/fact", canonicalUrl: "https://publisher.example/fact", evidenceText: "A second confirmed fact." };

function buildPacket(eventKey) {
  return {
    schemaVersion: 3,
    mode: "chatgpt-handoff",
    finalizedAt: "2026-09-11T04:00:00.000Z",
    coverageThrough: window.windowEnd,
    outputSchema: {},
    continuation: { scope: "news", preservePublished: true },
    editorialInput: { schemaVersion: 2, window, trackingQueue: [], packages: [{ eventKey, subjectKey: "same-game", sources: [source] }] },
  };
}

function newsDecision(eventKey, existingEntryId = undefined) {
  return {
    eventKey,
    ...(existingEntryId ? { existingEntryId } : {}),
    decision: "include",
    section: "news",
    titleKey: "same-game",
    titleZhCn: null,
    titleEn: "Same Game",
    titleZhStatus: "unavailable",
    headline: "《Same Game》公布另一项事实",
    summary: "开发商确认了另一项信息。",
    factStatus: "official",
    timeStatus: "date_only",
    entryFlags: [],
    tracking: false,
    verification: "已打开一手来源。",
    reason: "同一作品的新事实。",
    beijingTime: "2026-09-11 09:30",
    timeNote: "只确认日期。",
    platforms: ["PC"],
    region: "全球",
    releaseType: "更新",
    sourceIndexes: [0],
    additionalSources: [],
    sharedFactFrame: { subjectTitleKey: "same-game", dates: [], times: [], numbers: [existingEntryId ? "1" : "2"], platforms: ["PC"], peopleAndEntities: [], versionsAndTerms: [] },
  };
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

  it("reserves the next queue turn for showcase after one news activation", () => {
    const input = queueFixture();
    input.queue.batches = [
      { name: "showcase-1.json", scope: "showcase", status: "pending", eventKeys: ["showcase-1"] },
      ...input.queue.batches,
    ];
    input.packets["showcase-1.json"] = packet(["showcase-1"], "showcase");
    const first = advanceEditorialQueue(input);
    expect(first.batch).toMatchObject({ name: "news-1.json", scope: "news" });
    expect(first.queue.newsSinceShowcase).toBe(1);

    const completed = publishContinuation(first.state, first.packet, "6".repeat(40));
    const second = advanceEditorialQueue({ ...input, queue: first.queue, state: completed, canonical: { id: editionId, entries: [] } });
    expect(second.batch).toMatchObject({ name: "showcase-1.json", scope: "showcase" });
    expect(second.queue.newsSinceShowcase).toBe(0);
  });

  it("adds a different same-title fact but preserves an explicitly matched retry", () => {
    const existingEntry = {
      id: "2026-09-11-daily-news-0",
      section: "news",
      title: { title_key: "same-game", title_en: "Same Game", title_zh_status: "unavailable" },
      headline: "《Same Game》旧事实",
      summary: "原有事实。",
      sources: [{ label: "Publisher", url: source.url, kind: "primary" }],
    };
    const latest = { id: editionId, issueNumber: 40, leadEntryId: existingEntry.id, archiveTitle: "日报｜《Same Game》旧事实", entries: [existingEntry], upcoming: [], tracking: [], sourceReport: {} };
    const manifest = { schemaVersion: 1, latest: editionId, editions: [{ id: editionId, issueNumber: 40, date: "2026-09-11", period: "daily" }] };
    const continuationPacket = buildPacket("news-new-fact");
    const continuation = { ...queueFixture(), packets: { "news-1.json": JSON.stringify(continuationPacket) } };
    continuation.queue.batches = [{ name: "news-1.json", scope: "news", status: "pending", eventKeys: ["news-new-fact"] }];
    const activated = advanceEditorialQueue(continuation);
    const editorial = {
      contractVersion: 2,
      packetBlobSha: gitBlobSha(JSON.stringify(continuationPacket)),
      editionId,
      archiveTitle: latest.archiveTitle,
      leadEventKey: "news-new-fact",
      decisions: [newsDecision("news-new-fact")],
      upcomingMode: "inherit_and_patch",
      removeUpcomingIds: [],
      upcoming: [],
      checkedExtra: [],
      limitedExtra: [],
      editorialNote: "续接包编辑。",
    };
    const added = buildEdition({ packet: continuationPacket, editorial, latest, manifest, allowSameEditionRevision: true });
    expect(added.status).toBe("revised");
    expect(added.edition.entries).toHaveLength(2);
    expect(added.edition.entries.some(entry => entry.headline.includes("另一项事实"))).toBe(true);
    expect(activated.state.revisionRequest.batchName).toBe("news-1.json");

    const retryPacket = buildPacket("news-same-fact");
    const retry = buildEdition({
      packet: retryPacket,
      editorial: { ...editorial, packetBlobSha: gitBlobSha(JSON.stringify(retryPacket)), leadEventKey: "news-same-fact", decisions: [newsDecision("news-same-fact", existingEntry.id)] },
      latest,
      manifest,
      allowSameEditionRevision: true,
    });
    expect(retry.status).toBe("revised");
    expect(retry.edition.entries).toHaveLength(1);
    expect(retry.edition.entries[0].headline).toBe(existingEntry.headline);

    const rerun = buildEdition({
      packet: continuationPacket,
      editorial,
      latest: added.edition,
      manifest: added.manifest,
      allowSameEditionRevision: true,
    });
    expect(rerun.status).toBe("already-exists");
    expect(rerun.edition).toBeNull();

    const otherEntry = {
      ...existingEntry,
      id: "2026-09-11-daily-news-1",
      title: { title_key: "other-game", title_en: "Other Game", title_zh_status: "unavailable" },
      headline: "《Other Game》旧事实",
    };
    const wrongSubjectPacket = buildPacket("news-wrong-subject");
    expect(() => buildEdition({
      packet: wrongSubjectPacket,
      editorial: {
        ...editorial,
        packetBlobSha: gitBlobSha(JSON.stringify(wrongSubjectPacket)),
        leadEventKey: "news-wrong-subject",
        decisions: [newsDecision("news-wrong-subject", otherEntry.id)],
      },
      latest: { ...latest, entries: [existingEntry, otherEntry] },
      manifest,
      allowSameEditionRevision: true,
    })).toThrow("existingEntryId must identify the confirmed subject");
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
