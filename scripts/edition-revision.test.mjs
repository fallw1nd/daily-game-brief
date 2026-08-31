import { describe, expect, it } from "vitest";
import { applyEditionStateEvent, createEditionState } from "./lib/edition-state.mjs";
import { buildEdition } from "./lib/edition-publisher.mjs";

const packetSha = "1".repeat(40);
const submissionSha = "2".repeat(40);
const priorMainSha = "3".repeat(40);
const revisedMainSha = "4".repeat(40);
const editionId = "2026-08-31-daily";

function publishedState() {
  let state = createEditionState(editionId, "2026-08-31T02:11:00.000Z");
  state = applyEditionStateEvent(state, "packet-ready", { editionId, packetBlobSha: packetSha });
  state = applyEditionStateEvent(state, "editorial-submitted", { packetBlobSha: packetSha, submissionSha });
  state = applyEditionStateEvent(state, "editorial-valid", { packetBlobSha: packetSha, submissionSha });
  state = applyEditionStateEvent(state, "publication-committed", { mainSha: priorMainSha, source: "editorial" });
  state = applyEditionStateEvent(state, "deployment-succeeded", { mainSha: priorMainSha, runId: "100" });
  return state;
}

const packet = {
  editorialInput: {
    window: {
      id: editionId,
      period: "daily",
      plannedAt: "2026-08-31 12:00",
      windowStart: "2026-08-30 17:00",
      windowEnd: "2026-08-31 10:10",
    },
    packages: [{
      eventKey: "event-1",
      tier: "A",
      sources: [{ sourceIndex: 0, status: "opened", kind: "primary", label: "Publisher", url: "https://publisher.example/news" }],
    }],
  },
};

const editorial = {
  editionId,
  archiveTitle: "日报｜《Example Game》正式公布",
  leadEventKey: "event-1",
  decisions: [{
    eventKey: "event-1",
    decision: "include",
    section: "news",
    titleKey: "example-game",
    titleZhCn: null,
    titleEn: "Example Game",
    titleZhStatus: "unavailable",
    headline: "《Example Game》正式公布",
    summary: "开发商公布了作品的首批确定信息。",
    factStatus: "official",
    timeStatus: "verified",
    entryFlags: [],
    tracking: false,
    verification: "已打开开发商公告。",
    reason: "一手来源确认。",
    beijingTime: "2026-08-31 09:30",
    timeNote: "公告时间处于固定窗口。",
    platforms: ["PC"],
    region: "全球",
    releaseType: "新作公布",
    sourceIndexes: [0],
    additionalSources: [],
  }],
  upcomingMode: "replace",
  removeUpcomingIds: [],
  upcoming: [],
  checkedExtra: [],
  limitedExtra: [],
  editorialNote: "用户授权同一期生产验收修订。",
};

const currentLatest = {
  id: editionId,
  issueNumber: 21,
  upcoming: [],
  entries: [{ headline: "Existing normal editorial story" }],
  sourceReport: { note: "正常编辑发布。" },
};
const manifest = {
  schemaVersion: 1,
  updatedAt: "2026-08-31 15:06",
  latest: editionId,
  editions: [{ id: editionId, issueNumber: 21, date: "2026-08-31", period: "daily" }],
};

describe("authorized same-edition production revision", () => {
  it("opens a new durable cycle only after an already committed publication", () => {
    const state = applyEditionStateEvent(publishedState(), "revision-opened", {
      reason: "user_authorized_same_edition_revision",
      actor: "maintenance-test",
      at: "2026-08-31T13:50:00.000Z",
    });
    expect(state.revisionRequest).toMatchObject({
      status: "open",
      reason: "user_authorized_same_edition_revision",
      previousMainSha: priorMainSha,
    });
    expect(state.packet.status).toBe("pending");
    expect(state.editorial.status).toBe("pending");
    expect(state.publication.status).toBe("pending");
    expect(state.deployment.status).toBe("pending");
  });

  it("makes a retry of the same already-open revision idempotent after publication was reset to pending", () => {
    const opened = applyEditionStateEvent(publishedState(), "revision-opened", {
      reason: "user_authorized_same_edition_revision",
      actor: "maintenance-test",
      at: "2026-08-31T13:50:00.000Z",
    });
    const retried = applyEditionStateEvent(opened, "revision-opened", {
      reason: "user_authorized_same_edition_revision",
      actor: "maintenance-test",
      at: "2026-08-31T13:51:00.000Z",
    });
    expect(retried).toEqual(opened);
    expect(retried.publication.status).toBe("pending");
    expect(retried.revisionRequest.status).toBe("open");
  });

  it("rejects revision opening without explicit authorization", () => {
    expect(() => applyEditionStateEvent(publishedState(), "revision-opened", { reason: "retry" }))
      .toThrow("explicit user authorization");
  });

  it("keeps a normal current edition immutable without an open revision cycle", () => {
    const result = buildEdition({ packet, editorial, latest: currentLatest, manifest });
    expect(result.status).toBe("already-exists");
  });

  it("revises only the current latest edition when durable revision authorization is present", () => {
    const result = buildEdition({
      packet,
      editorial,
      latest: currentLatest,
      manifest,
      allowSameEditionRevision: true,
      now: new Date("2026-08-31T13:55:00.000Z"),
    });
    expect(result.status).toBe("revised");
    expect(result.edition.issueNumber).toBe(21);
    expect(result.edition.id).toBe(editionId);
    expect(result.edition.windowStart).toBe("2026-08-30 17:00");
    expect(result.edition.windowEnd).toBe("2026-08-31 10:10");
    expect(result.manifest.editions).toHaveLength(1);
  });

  it("closes the durable revision request after the revised publication commits", () => {
    let state = applyEditionStateEvent(publishedState(), "revision-opened", {
      reason: "user_authorized_same_edition_revision",
    });
    state = applyEditionStateEvent(state, "packet-ready", { packetBlobSha: "5".repeat(40) });
    state = applyEditionStateEvent(state, "editorial-submitted", { packetBlobSha: "5".repeat(40), submissionSha: "6".repeat(40) });
    state = applyEditionStateEvent(state, "editorial-valid", { packetBlobSha: "5".repeat(40), submissionSha: "6".repeat(40) });
    state = applyEditionStateEvent(state, "publication-committed", { mainSha: revisedMainSha, source: "editorial" });
    expect(state.revisionRequest.status).toBe("completed");
    expect(state.revisionRequest.completedAt).toBeTruthy();
    expect(state.publication.mainSha).toBe(revisedMainSha);
  });
});
