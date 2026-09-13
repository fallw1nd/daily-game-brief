import { describe, expect, it } from "vitest";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";
import { gitBlobSha } from "./lib/edition-state.mjs";
import { bundleSerializedChars, completedPacketCycle, validateEditorialBundle } from "./lib/editorial-bundle.mjs";

const editionId = "2026-09-12-daily";
const window = expectedEditorialWindow(editionId);
const source = {
  sourceIndex: 0,
  status: "opened",
  kind: "primary",
  independenceKey: "publisher",
  label: "Publisher",
  url: "https://publisher.example/fact",
  canonicalUrl: "https://publisher.example/fact",
  evidenceText: "The publisher confirms the fact.",
};

function packet(eventKey, continuation = null) {
  return {
    schemaVersion: 3,
    mode: "chatgpt-handoff",
    finalizedAt: "2026-09-12T04:00:00.000Z",
    coverageThrough: window.windowEnd,
    outputSchema: {},
    ...(continuation ? { continuation } : {}),
    editorialInput: {
      schemaVersion: 2,
      window,
      trackingQueue: [],
      packages: [{ eventKey, subjectKey: eventKey, sources: [source] }],
    },
  };
}

function editorial(eventKey, packetBlobSha) {
  return {
    contractVersion: 2,
    packetBlobSha,
    editionId,
    archiveTitle: "日报｜《Bundle Game》确认事实",
    leadEventKey: eventKey,
    decisions: [{
      eventKey,
      decision: "include",
      section: "news",
      titleKey: eventKey,
      titleZhCn: null,
      titleEn: "Bundle Game",
      titleZhStatus: "unavailable",
      headline: "《Bundle Game》确认事实",
      summary: "发行方确认了这项信息。",
      factStatus: "official",
      timeStatus: "date_only",
      entryFlags: [],
      tracking: false,
      verification: "已打开一手来源。",
      reason: "一手来源确认。",
      beijingTime: "2026-09-12 09:30",
      timeNote: "只确认日期。",
      platforms: ["PC"],
      region: "全球",
      releaseType: "更新",
      sourceIndexes: [0],
      additionalSources: [],
      sharedFactFrame: { subjectTitleKey: eventKey, dates: [], times: [], numbers: [], platforms: ["PC"], peopleAndEntities: [], versionsAndTerms: [] },
    }],
    upcomingMode: "inherit_and_patch",
    removeUpcomingIds: [],
    upcoming: [],
    checkedExtra: [],
    limitedExtra: [],
    editorialNote: "有界 bundle 编辑。",
  };
}

function validBundle() {
  const packetOne = JSON.stringify(packet("daily-fact"), null, 2) + "\n";
  const packetTwo = JSON.stringify(packet("news-fact", { scope: "news", preservePublished: true }), null, 2) + "\n";
  const shaOne = gitBlobSha(packetOne);
  const shaTwo = gitBlobSha(packetTwo);
  const snapshot = { stateCommit: "a".repeat(40), queueBlobSha: "b".repeat(40) };
  const bundle = {
    schemaVersion: 1,
    editionId,
    submissions: [
      { index: 0, packetBlobSha: shaOne, scope: "canonical", batchName: null, eventKeys: ["daily-fact"], queueSnapshot: snapshot, editorial: editorial("daily-fact", shaOne) },
      { index: 1, packetBlobSha: shaTwo, scope: "news", batchName: "news-1.json", eventKeys: ["news-fact"], queueSnapshot: snapshot, editorial: editorial("news-fact", shaTwo) },
    ],
  };
  return { bundle, packetTexts: new Map([[shaOne, packetOne], [shaTwo, packetTwo]]) };
}

describe("bounded same-edition editorial bundle", () => {
  it("validates two GitHub-resolved packet identities and exact serialized input size", () => {
    const { bundle, packetTexts } = validBundle();
    bundle.serializedChars = bundleSerializedChars(bundle, packetTexts);
    expect(validateEditorialBundle(bundle, { branchName: `automation/editorial/${editionId}`, packetTextsBySha: packetTexts })).toEqual([]);
  });

  it("rejects an editor-requested blob that differs from the trusted plan", () => {
    const { bundle, packetTexts } = validBundle();
    bundle.submissions[1].requestedPacketBlobSha = "f".repeat(40);
    expect(validateEditorialBundle(bundle, { branchName: `automation/editorial/${editionId}`, packetTextsBySha: packetTexts }).some(error => error.includes("requestedPacketBlobSha does not match"))).toBe(true);
  });

  it("rejects duplicate event identities and a third packet", () => {
    const { bundle, packetTexts } = validBundle();
    bundle.submissions[1].eventKeys = ["daily-fact"];
    expect(validateEditorialBundle(bundle, { branchName: `automation/editorial/${editionId}`, packetTextsBySha: packetTexts }).some(error => error.includes("appears in more than one bundle submission"))).toBe(true);
    const third = structuredClone(bundle.submissions[1]);
    third.index = 2;
    bundle.submissions.push(third);
    expect(validateEditorialBundle(bundle, { branchName: `automation/editorial/${editionId}`, packetTextsBySha: packetTexts }).some(error => error.includes("at most 2 submissions"))).toBe(true);
  });

  it("does not borrow a later packet cycle after an earlier packet is invalid", () => {
    const transitions = [
      { revision: 1, event: "packet-ready", packetBlobSha: "a".repeat(40) },
      { revision: 2, event: "editorial-submitted", packetBlobSha: "a".repeat(40), submissionSha: "1".repeat(40) },
      { revision: 3, event: "editorial-invalid", submissionSha: "1".repeat(40) },
      { revision: 4, event: "packet-ready", packetBlobSha: "b".repeat(40) },
      { revision: 5, event: "editorial-submitted", packetBlobSha: "b".repeat(40), submissionSha: "2".repeat(40) },
      { revision: 6, event: "editorial-valid", submissionSha: "2".repeat(40) },
      { revision: 7, event: "publication-committed", mainSha: "3".repeat(40) },
    ];
    expect(completedPacketCycle(transitions, "a".repeat(40))).toBeNull();
    expect(completedPacketCycle(transitions, "b".repeat(40))).toMatchObject({
      submitted: { packetBlobSha: "b".repeat(40), submissionSha: "2".repeat(40) },
      valid: { submissionSha: "2".repeat(40) },
    });
  });
});
