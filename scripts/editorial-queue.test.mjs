import { describe, expect, it } from "vitest";
import { advanceEditorialQueue } from "./lib/editorial-queue.mjs";
import { applyEditionStateEvent, createEditionState, gitBlobSha } from "./lib/edition-state.mjs";
import { buildEdition } from "./lib/edition-publisher.mjs";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";
import { projectionDigest } from "./lib/locale-digest.mjs";
import { deferredCalendarReview } from "./lib/calendar-review.mjs";

const editionId = "2026-09-11-daily";
const window = expectedEditorialWindow(editionId);

it("keeps deferred calendar work in the trusted queue and closes it only after every page and platform is reviewed", () => {
  const pageKey = "a".repeat(40);
  const calendarWork = { pages: [{ blobSha: pageKey }] };
  const text = packet([], "calendar", { calendarWork });
  const fixture = { state: publishedState(), canonical: { id: editionId, entries: [], sourceReport: { calendarReview: deferredCalendarReview(calendarWork, "Official detail unavailable") } },
    queue: { editionId, batches: [{ name: "calendar.json", scope: "calendar", status: "pending", eventKeys: [pageKey] }] }, packets: { "calendar.json": text } };
  const first = advanceEditorialQueue(fixture);
  expect(first.batch.scope).toBe("calendar");
  expect(first.state.revisionRequest).toMatchObject({ reason: "editorial_continuation", batchScope: "calendar", eventKeys: [pageKey] });
  expect(first.state.packet.blobSha).toBe(gitBlobSha(text));
  const state = publishContinuation(first.state, text, "4".repeat(40));
  const partial = advanceEditorialQueue({ ...fixture, state, queue: first.queue });
  expect(partial.queue.batches[0].status).toBe("awaiting_retry");
  expect(partial.packet).toBeNull();
  const reviewed = structuredClone(fixture.canonical);
  [...reviewed.sourceReport.calendarReview.pages, ...reviewed.sourceReport.calendarReview.platforms].forEach(row => row.status = "reviewed");
  const complete = advanceEditorialQueue({ ...fixture, canonical: reviewed });
  expect(complete.queue.batches[0].status).toBe("completed");
  expect(complete.packet).toBeNull();
  const tampered = packet(["foreign-news"], "calendar", { calendarWork });
  expect(() => advanceEditorialQueue({ ...fixture, packets: { "calendar.json": tampered } })).toThrow(/only its pinned calendar/);
  expect(() => advanceEditorialQueue({ ...fixture, queue: { ...fixture.queue, batches: [{ ...fixture.queue.batches[0], eventKeys: ["b".repeat(40)] }] } })).toThrow(/only its pinned calendar/);
});

it("publishes a calendar-only continuation without changing news, issue, lead, tracking or news audit", () => {
  const existing = { id: `${editionId}-news-0`, title: { title_key: "game", title_en: "Game", title_zh_status: "unavailable" }, headline: "Game 已确认新闻", sources: [] };
  const latest = { id: editionId, issueNumber: 40, archiveTitle: "日报｜Game 已确认新闻", leadEntryId: existing.id, entries: [existing], upcoming: [], tracking: ["keep"], sourceReport: { checked: ["news evidence"], limited: ["news limitation", "日历核验延期 old"], note: "news note", auditStats: { eventLedgerCandidates: 29 } } };
  const manifest = { latest: editionId, editions: [{ id: editionId, issueNumber: 40 }] };
  const calendarWork = { pages: [{ blobSha: "a".repeat(40) }] };
  const calendarPacket = JSON.parse(packet([], "calendar", { calendarWork }));
  const editorial = { editionId, archiveTitle: latest.archiveTitle, decisions: [], upcomingMode: "inherit_and_patch", removeUpcomingIds: [], upcoming: [{ id: "release", date: "2026-09-12", titleKey: "new-game", titleEn: "New Game", titleZhCn: null, titleZhStatus: "unavailable", platforms: ["PC"], region: "US", releaseType: "正式发售", source: { label: "Steam", url: "https://store.steampowered.com/app/123/", kind: "primary" }, note: "Official store date verified" }], checkedExtra: ["calendar detail"], limitedExtra: [], editorialNote: "Calendar review", calendarReview: deferredCalendarReview(calendarWork, "one remaining blocker") };
  const result = buildEdition({ packet: calendarPacket, editorial, latest, manifest, allowSameEditionRevision: true });
  expect(result.edition.entries).toEqual(latest.entries);
  expect(result.edition.tracking).toEqual(latest.tracking);
  expect(result.edition.issueNumber).toBe(40);
  expect(result.edition.archiveTitle).toBe(latest.archiveTitle);
  expect(result.edition.leadEntryId).toBe(latest.leadEntryId);
  expect(result.edition.upcoming).toHaveLength(1);
  expect(result.edition.upcoming[0].date).toBe("09.12");
  expect(result.edition.sourceReport.auditStats).toEqual(latest.sourceReport.auditStats);
  expect(result.edition.sourceReport.note).toBe("news note");
  expect(result.edition.sourceReport.limited).toContain("news limitation");
  expect(result.edition.sourceReport.limited).not.toContain("日历核验延期 old");
  expect(() => buildEdition({ packet: calendarPacket, editorial: { ...editorial, decisions: [{ decision: "include" }] }, latest, manifest, allowSameEditionRevision: true })).toThrow(/cannot change news/);
});

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

function newsDecision(eventKey, existingEntryId = undefined, factToken = existingEntryId ? "fact-1" : "fact-2") {
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
    sharedFactFrame: { subjectTitleKey: "same-game", dates: [], times: [], numbers: [factToken], platforms: ["PC"], peopleAndEntities: [], versionsAndTerms: [] },
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

  it("reconciles an orphan only against every exact committed manual decision", () => {
    const input = queueFixture();
    input.queue.batches = [{ name: "news-1.json", scope: "news", status: "editing", eventKeys: ["news-1"], activatedAt: "2026-09-11T04:00:00Z" }];
    input.queue.activeBatchName = "news-1.json";
    input.canonical.sourceReport = { editorialDecisionDigest: "committed" };
    const decision = { lastDecision: "exclude", lastDecisionReason: "Confirmed duplicate", lastDecisionEdition: editionId, lastDecisionIdentity: "committed", lastDecisionAt: "2026-09-11T05:00:00Z" };
    expect(() => advanceEditorialQueue(input)).toThrow("reconciliation required");
    for (const changed of [{ lastDecisionIdentity: "stale" }, { lastDecision: "needs_review" }, { lastDecisionEdition: "2026-09-10-daily" }, { lastDecisionAt: "2026-09-11T03:00:00Z" }]) {
      expect(() => advanceEditorialQueue({ ...input, ledger: { events: { "news-1": { ...decision, ...changed } } } })).toThrow("reconciliation required");
    }
    const result = advanceEditorialQueue({ ...input, ledger: { events: { "news-1": decision } } });
    expect(result.queue.batches[0]).toMatchObject({ status: "completed", reconciliation: { decisionDigest: "committed" } });
    expect(result.queue.activeBatchName).toBeNull();
    expect(result.packet).toBeNull();
    expect(result.state).toEqual(input.state);
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
    const sameFactDecision = newsDecision("news-same-fact", undefined, "fact-1");
    const existingEntry = {
      id: "2026-09-11-daily-news-0",
      section: "news",
      title: { title_key: "same-game", title_en: "Same Game", title_zh_status: "unavailable" },
      headline: sameFactDecision.headline,
      summary: sameFactDecision.summary,
      sources: [{ label: "Publisher", url: source.url, kind: "primary" }],
      sharedFactFrameDigest: projectionDigest(sameFactDecision.sharedFactFrame),
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
    })).toThrow("existingEntryId must identify the confirmed same fact");
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
