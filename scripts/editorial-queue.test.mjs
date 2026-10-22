import { applyEditorialFeedback } from "./lib/event-ledger.mjs";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { advanceEditorialQueue, orderCalendarQueueEditions, openManualRevision } from "./lib/editorial-queue.mjs";
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

it("backs off an old calendar's newly completed partial attempt without losing its pinned budget blocker", () => {
  const observed = JSON.parse(readFileSync("scripts/fixtures/release-calendar/continuation-budget-blocker.json", "utf8"));
  expect(observed.source.status).toBe("deferred");
  expect(observed.deferredSources).toBe(83);
  const calendarWork = { pages: [{ blobSha: observed.source.pageBlobSha }] };
  const text = packet([], "calendar", { calendarWork });
  const canonical = { id: editionId, entries: [], sourceReport: {
    calendarReview: deferredCalendarReview(calendarWork, observed.source.error),
  } };
  const input = { state: publishedState(), canonical,
    queue: { editionId, firstPublishedAt: "2026-09-11T04:00:00.000Z", batches: [
      { name: "calendar.json", scope: "calendar", status: "pending", eventKeys: [observed.source.pageBlobSha] },
    ] }, packets: { "calendar.json": text } };
  const first = advanceEditorialQueue({ ...input, now: "2026-10-22T04:00:00.000Z" });
  const state = publishContinuation(first.state, text, "4".repeat(40));
  state.publication.updatedAt = "2026-10-22T04:10:00.000Z";
  const partial = advanceEditorialQueue({ ...input, state, queue: first.queue, now: state.publication.updatedAt });
  expect(partial.packet).toBeNull();
  expect(partial.state).toEqual(state);
  expect(partial.queue.batches[0]).toMatchObject({ status: "awaiting_retry", lastAttemptAt: state.publication.updatedAt });
  // Pre-fix durable queues have no lastAttemptAt; use their last activation,
  // not an already expired first-publication deadline.
  const legacy = structuredClone(partial.queue);
  delete legacy.batches[0].lastAttemptAt;
  expect(advanceEditorialQueue({ ...input, state, queue: legacy, now: "2026-10-22T04:29:59.999Z" }).packet).toBeNull();
  expect(advanceEditorialQueue({ ...input, state, queue: legacy, now: "2026-10-22T04:30:00.000Z" }).packet).toBe(text);
  const retry = now => advanceEditorialQueue({ ...input, state, queue: partial.queue, now });
  expect(retry("2026-10-22T04:39:59.999Z").packet).toBeNull();
  const due = retry("2026-10-22T04:40:00.000Z");
  expect(due.packet).toBe(text);
  expect(due.state.packet.blobSha).toBe(gitBlobSha(text));
  expect(due.batch).toMatchObject({ retryAttempts: 1, eventKeys: [observed.source.pageBlobSha] });
  expect(canonical.sourceReport.calendarReview.pages[0]).toMatchObject({ status: "deferred", reason: observed.source.error });
  // The next completion starts a fresh, longer retry delay, even weeks after the edition.
  const secondState = publishContinuation(due.state, text, "5".repeat(40));
  secondState.publication.updatedAt = "2026-10-22T05:00:00.000Z";
  const second = advanceEditorialQueue({ ...input, state: secondState, queue: due.queue, now: secondState.publication.updatedAt });
  expect(second.packet).toBeNull();
  expect(advanceEditorialQueue({ ...input, state: secondState, queue: second.queue, now: "2026-10-22T06:59:59.999Z" }).packet).toBeNull();
  expect(advanceEditorialQueue({ ...input, state: secondState, queue: second.queue, now: "2026-10-22T07:00:00.000Z" }).packet).toBe(text);
});

it("shares eligible calendar turns without displacing news, showcase, or not-yet-due work", () => {
  const editions = ["2026-10-18-daily", "news", "2026-10-20-daily", "showcase", "2026-10-21-daily", "2026-10-22-daily"].map(id => ({ id }));
  const batch = (status, activatedAt) => ({ scope: "calendar", status, activatedAt, retryAttempts: 0 });
  const queue = batches => ({ firstPublishedAt: "2026-10-18T04:00:00Z", batches });
  const queues = {
    "2026-10-18-daily": queue([batch("awaiting_retry", "2026-10-22T04:00:00Z")]),
    news: queue([{ scope: "news", status: "pending" }]),
    "2026-10-20-daily": queue([batch("pending")]),
    showcase: queue([{ scope: "showcase", status: "pending" }]),
    "2026-10-21-daily": queue([batch("awaiting_retry", "2026-10-21T04:00:00Z")]),
    "2026-10-22-daily": queue([batch("awaiting_retry", "2026-10-22T04:50:00Z")]),
  };
  const before = structuredClone(queues);
  const ordered = orderCalendarQueueEditions(editions, queues, Date.parse("2026-10-22T05:00:00Z"));
  expect(ordered.map(row => row.id)).toEqual(["2026-10-20-daily", "news", "2026-10-21-daily", "showcase", "2026-10-18-daily", "2026-10-22-daily"]);
  expect(queues).toEqual(before);
  // Equal never-attempted priorities remain oldest-first and do not drop work.
  queues["2026-10-18-daily"] = queue([batch("pending")]);
  expect(orderCalendarQueueEditions(editions, queues, Date.parse("2026-10-22T05:00:00Z"))[0].id).toBe("2026-10-18-daily");
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


describe("manual revision takeover of an unconsumed continuation", () => {
  const reason = "user_authorized_same_edition_revision";
  function active(scope = "news") {
    const input = queueFixture();
    if (scope === "calendar") {
      const key = "a".repeat(40);
      input.queue.batches = [{ name: "calendar.json", scope, status: "pending", eventKeys: [key], retryAttempts: 2 }];
      input.packets = { "calendar.json": packet([], scope, { calendarWork: { pages: [{ blobSha: key }] } }) };
      input.canonical.sourceReport = { calendarReview: deferredCalendarReview({ pages: [{ blobSha: key }] }, "still pending") };
    }
    const result = advanceEditorialQueue(input);
    return { ...input, state: result.state, queue: result.queue };
  }
  it.each(["news", "calendar"])("requeues exact %s work and resumes it after manual publication without false completion", scope => {
    const input = active(scope);
    const before = structuredClone(input);
    const result = openManualRevision({ ...input, reason });
    expect(input).toEqual(before);
    expect(result.state.revisionRequest).toMatchObject({ status: "open", reason, previousMainSha: input.state.revisionRequest.previousMainSha });
    expect(result.state.fixedWindow).toEqual(input.state.fixedWindow);
    expect(result.state.packet.status).toBe("pending");
    expect(result.state.transitions.at(-1).suspendedContinuation).toEqual(input.state.revisionRequest);
    expect(result.queue).toEqual({ ...input.queue, activeBatchName: null,
      batches: input.queue.batches.map(batch => batch.name === input.queue.activeBatchName ? { ...batch, status: "pending" } : batch) });
    expect(advanceEditorialQueue({ ...input, ...result }).packet).toBeNull();
    const replay = openManualRevision({ ...input, ...result, reason });
    expect(replay).toEqual(result);
    const text = input.packets[input.queue.activeBatchName];
    const manualText = packet(["manual-revision"]);
    let manual = applyEditionStateEvent(result.state, "packet-ready", { packetBlobSha: gitBlobSha(manualText) });
    manual = publishContinuation(manual, manualText, "7".repeat(40));
    const resumed = advanceEditorialQueue({ ...input, queue: result.queue, state: manual });
    expect(resumed.packet).toBe(text);
    expect(resumed.batch.name).toBe(input.queue.activeBatchName);
    expect(resumed.batch.status).toBe("editing");
    expect(resumed.state.revisionRequest.eventKeys).toEqual(input.state.revisionRequest.eventKeys);
    expect(resumed.state.packet.blobSha).toBe(input.state.packet.blobSha);
    expect(input.canonical).toEqual(before.canonical);
  });
  it("cold-starts eligible takeover without installed dependencies, records both files, and rejects unsafe retries", () => {
    const input = active("calendar");
    const root = mkdtempSync(join(tmpdir(), "manual-takeover-"));
    const statePath = join(root, `automation/status/${editionId}.json`);
    const batchRoot = join(root, `automation/batches/${editionId}`);
    const queuePath = join(batchRoot, "queue.json");
    const packetPath = join(batchRoot, input.queue.activeBatchName);
    const run = () => execFileSync(process.execPath, [join(root, "scripts/record-edition-state.mjs"),
      `--state-root=${root}`, `--edition=${editionId}`, "--event=revision-opened", `--reason=${reason}`],
      { cwd: root, stdio: "pipe", env: { ...process.env, GITHUB_OUTPUT: "", NODE_PATH: "" } });
    try {
      // Copy source, not node_modules: this is the workflow's pre-npm-ci path.
      mkdirSync(join(root, "scripts"), { recursive: true });
      cpSync(resolve("scripts/lib"), join(root, "scripts/lib"), { recursive: true });
      cpSync(resolve("scripts/record-edition-state.mjs"), join(root, "scripts/record-edition-state.mjs"));
      expect(existsSync(join(root, "node_modules"))).toBe(false);
      mkdirSync(join(root, "automation/status"), { recursive: true });
      mkdirSync(batchRoot, { recursive: true });
      writeFileSync(statePath, JSON.stringify(input.state));
      writeFileSync(queuePath, JSON.stringify(input.queue));
      writeFileSync(packetPath, input.packets[input.queue.activeBatchName]);
      run();
      const written = [statePath, queuePath, packetPath].map(path => readFileSync(path, "utf8"));
      expect(JSON.parse(written[0]).revisionRequest.reason).toBe(reason);
      expect(JSON.parse(written[1]).batches[0].status).toBe("pending");
      expect(written[2]).toBe(input.packets[input.queue.activeBatchName]);
      run();
      expect([statePath, queuePath, packetPath].map(path => readFileSync(path, "utf8"))).toEqual(written);
      writeFileSync(statePath, JSON.stringify(input.state));
      const mismatch = structuredClone(input.queue);
      mismatch.activeBatchName = "wrong.json";
      writeFileSync(queuePath, JSON.stringify(mismatch));
      const mismatched = [statePath, queuePath, packetPath].map(path => readFileSync(path, "utf8"));
      expect(run).toThrow();
      expect([statePath, queuePath, packetPath].map(path => readFileSync(path, "utf8"))).toEqual(mismatched);
      input.state.packet.status = "pending";
      writeFileSync(statePath, JSON.stringify(input.state));
      writeFileSync(queuePath, JSON.stringify(input.queue));
      const collecting = [statePath, queuePath, packetPath].map(path => readFileSync(path, "utf8"));
      expect(run).toThrow();
      expect([statePath, queuePath, packetPath].map(path => readFileSync(path, "utf8"))).toEqual(collecting);
      input.state.packet.status = "ready";
      input.state.editorial.status = "submitted";
      writeFileSync(statePath, JSON.stringify(input.state));
      writeFileSync(queuePath, JSON.stringify(input.queue));
      const blocked = [statePath, queuePath, packetPath].map(path => readFileSync(path, "utf8"));
      expect(run).toThrow();
      expect([statePath, queuePath, packetPath].map(path => readFileSync(path, "utf8"))).toEqual(blocked);
      expect(readFileSync("scripts/update-edition-state-branch.sh", "utf8")).toContain('git -C "$state_dir" add "automation/batches/$edition/queue.json"');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 15_000); // Multiple real Node subprocesses need scheduling headroom under CI load.
  it.each(["submitted", "valid", "invalid", "timed_out"])("rejects consumed %s work", status => {
    const input = active();
    input.state.editorial.status = status;
    expect(() => openManualRevision({ ...input, reason })).toThrow("active or consumed");
  });
  it.each(["failed", "committed"])("rejects %s publication instead of replacing work", status => {
    const input = active();
    input.state.publication.status = status;
    expect(() => openManualRevision({ ...input, reason })).toThrow("active or consumed");
  });
  it("rejects hidden consumption and publication identity even with pending lane labels", () => {
    for (const lane of ["editorial", "publication"]) {
      const input = active();
      input.state[lane][lane === "editorial" ? "submissionSha" : "mainSha"] = "f".repeat(40);
      expect(() => openManualRevision({ ...input, reason })).toThrow("active or consumed");
    }
  });
  it("rejects missing authorization, other open reasons, and failed packets", () => {
    const input = active();
    expect(() => openManualRevision({ ...input, reason: "retry" })).toThrow("explicit user authorization");
    for (const status of ["pending", "failed"]) {
      input.state.packet.status = status;
      expect(() => openManualRevision({ ...input, reason })).toThrow("active or consumed");
    }
    const showcase = applyEditionStateEvent(publishedState(), "supplement-opened", { reason: "showcase_completion", announcementIds: ["one"] });
    expect(() => openManualRevision({ ...input, state: showcase, reason })).toThrow("different revision reason");
  });
  it("fails closed on queue, scope, packet, and active ownership mismatches without mutations", () => {
    const mutations = [
      input => { input.queue = null; },
      input => { input.queue.editionId = "2026-09-12-daily"; },
      input => { input.queue.activeBatchName = null; },
      input => { input.queue.batches[0].status = "completed"; },
      input => { input.queue.batches[0].scope = "calendar"; },
      input => { input.queue.batches[0].eventKeys = ["wrong"]; },
      input => { input.queue.batches.push({ ...input.queue.batches[0] }); },
      input => { input.queue.batches[1].status = "editing"; },
      input => { input.packets = {}; },
      input => { input.packets["news-1.json"] += "\n"; },
    ];
    for (const mutate of mutations) {
      const input = active();
      mutate(input);
      const before = structuredClone(input);
      expect(() => openManualRevision({ ...input, reason })).toThrow();
      expect(input).toEqual(before);
    }
  });
  it("keeps an already-open manual cycle idempotent even after consumption instead of resetting it", () => {
    const input = active();
    const first = openManualRevision({ ...input, reason });
    for (const status of ["pending", "submitted", "valid", "invalid", "timed_out"]) {
      const state = structuredClone(first.state);
      state.editorial.status = status;
      if (status !== "pending") state.editorial.submissionSha = "f".repeat(40);
      expect(openManualRevision({ ...input, state, queue: first.queue, reason })).toEqual({ state, queue: first.queue });
    }
  });
  it("leaves completed continuation queues intact when opening a normal manual cycle", () => {
    const input = active();
    const text = input.packets[input.queue.activeBatchName];
    const completed = publishContinuation(input.state, text, "7".repeat(40));
    const result = openManualRevision({ ...input, state: completed, reason });
    expect(result.queue).toEqual(input.queue);
    expect(result.state.revisionRequest.previousMainSha).toBe("7".repeat(40));
  });
});

it("integrates manual takeover, ledger suppression, queue resume and older no-include feedback", () => {
  const input = queueFixture();
  const active = advanceEditorialQueue(input);
  const manual = openManualRevision({ ...input, state: active.state, queue: active.queue, reason: "user_authorized_same_edition_revision" });
  const manualText = packet(["manual-target"]);
  const manualSha = gitBlobSha(manualText);
  let manualState = applyEditionStateEvent(manual.state, "packet-ready", { packetBlobSha: manualSha });
  manualState = publishContinuation(manualState, manualText, "6".repeat(40));
  const options = { latestEditionId: "2026-10-22-daily", state: manualState, decisionIdentity: "manual", decidedAt: "2026-10-22T19:00:00Z" };
  const ledger = { events: { "news-1": { editorialState: "included" } } };
  const decision = { editionId, packetBlobSha: manualSha, decisions: [{ eventKey: "news-1", decision: "exclude", reason: "Compact manual omission" }] };
  expect(applyEditorialFeedback(ledger, decision, {}, options)).toBe(ledger);
  const resumed = advanceEditorialQueue({ ...input, queue: manual.queue, state: manualState, ledger });
  expect(resumed.batch.name).toBe("news-1.json");
  expect(resumed.queue.batches[0].status).toBe("editing");
  expect(resumed.state.revisionRequest.reason).toBe("editorial_continuation");
  const completed = publishContinuation(resumed.state, resumed.packet, "7".repeat(40));
  const continuationDecision = { editionId, packetBlobSha: gitBlobSha(resumed.packet), decisions: [{ eventKey: "news-1", decision: "exclude", reason: "Reviewed no new fact" }] };
  const updated = applyEditorialFeedback(ledger, continuationDecision, JSON.parse(resumed.packet), { ...options, state: completed, decisionIdentity: "continuation" });
  expect(updated.events["news-1"].editorialState).toBe("excluded");
  const next = advanceEditorialQueue({ ...input, queue: resumed.queue, state: completed, ledger: updated });
  expect(next.queue.batches[0].status).toBe("completed");
  expect(next.batch.name).toBe("news-2.json");
});
