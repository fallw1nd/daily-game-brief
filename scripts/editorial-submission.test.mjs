import { describe, expect, it } from "vitest";
import { validateEditorialSubmission } from "./lib/editorial-submission.mjs";

const source = { sourceIndex: 0, status: "opened", kind: "primary", independenceKey: "publisher", label: "Publisher", url: "https://publisher.example/news", evidenceText: "Announcement." };
const packetBlobSha = "a".repeat(40);
const packet = {
  schemaVersion: 3,
  finalizedAt: "2026-08-27T02:10:01.000Z",
  coverageThrough: "2026-08-27 10:10",
  mode: "chatgpt-handoff",
  outputSchema: { type: "object" },
  editorialInput: {
    schemaVersion: 2,
    window: { id: "2026-08-27-am", period: "am", plannedAt: "2026-08-27 10:10", windowStart: "2026-08-26 17:00", windowEnd: "2026-08-27 10:10" },
    packages: [{ eventKey: "event-1", subjectKey: "example-game", publishability: "direct", sources: [source] }],
    trackingQueue: [],
  },
};
const editorial = {
  contractVersion: 2, packetBlobSha,
  editionId: "2026-08-27-am", archiveTitle: "早报｜《Example Game》正式公布", leadEventKey: "event-1",
  decisions: [{
    eventKey: "event-1", decision: "include", section: "news", titleKey: "example-game",
    titleZhCn: null, titleEn: "Example Game", titleZhStatus: "unavailable",
    headline: "《Example Game》正式公布", summary: "开发商公开了确定信息。", factStatus: "official",
    timeStatus: "verified", entryFlags: [], tracking: false, verification: "已打开一手来源。", reason: "一手确认。",
    beijingTime: "2026-08-27 09:30", timeNote: "处于固定窗口。", platforms: ["PC"], region: "全球",
    releaseType: "新作公布", sourceIndexes: [0], additionalSources: [],
    sharedFactFrame: {
      subjectTitleKey: "example-game",
      dates: [],
      times: ["2026-08-27 09:30"],
      numbers: [],
      platforms: ["PC"],
      peopleAndEntities: ["Publisher"],
      versionsAndTerms: [],
    },
  }],
  upcomingMode: "replace", removeUpcomingIds: [], upcoming: [], checkedExtra: [], limitedExtra: [], editorialNote: "正常编辑完成。",
};

describe("editorial submission handoff", () => {
  it("accepts an evidence-bounded decision on the matching branch", () => {
    expect(validateEditorialSubmission({ branchName: "automation/editorial/2026-08-27-am", packet, editorial, packetBlobSha })).toEqual([]);
  });

  it("accepts the first production Daily bridge submission", () => {
    const dailyPacket = {
      ...packet,
      finalizedAt: "2026-08-31T06:38:18.807Z",
      coverageThrough: "2026-08-31 10:10",
      editorialInput: {
        ...packet.editorialInput,
        window: {
          id: "2026-08-31-daily",
          period: "daily",
          plannedAt: "2026-08-31 12:00",
          windowStart: "2026-08-30 17:00",
          windowEnd: "2026-08-31 10:10",
        },
      },
    };
    const dailyEditorial = {
      ...editorial,
      editionId: "2026-08-31-daily",
      archiveTitle: "日报｜《Example Game》正式公布",
      upcomingMode: "replace",
    };
    expect(validateEditorialSubmission({
      branchName: "automation/editorial/2026-08-31-daily",
      packet: dailyPacket,
      editorial: dailyEditorial,
      packetBlobSha,
    })).toEqual([]);
  });

  it("rejects a mismatched branch and morning upcoming mode", () => {
    const errors = validateEditorialSubmission({
      branchName: "automation/editorial/2026-08-27-pm", packet,
      editorial: { ...editorial, upcomingMode: "inherit_and_patch" },
      packetBlobSha,
    });
    expect(errors).toContain("packet window does not match the submission branch");
    expect(errors).toContain("editorial editionId does not match the submission branch");
  });

  it("rejects an obsolete or pre-cutoff packet", () => {
    const errors = validateEditorialSubmission({
      branchName: "automation/editorial/2026-08-27-am",
      packet: { ...packet, schemaVersion: 2, finalizedAt: "2026-08-27T02:09:59.000Z" },
      editorial,
      packetBlobSha,
    });
    expect(errors).toContain("packet must use finalized schemaVersion 3");
    expect(errors).toContain("packet was not finalized at or after the fixed cutoff");
  });

  it("rejects a stale decision bound to a different packet blob", () => {
    const errors = validateEditorialSubmission({
      branchName: "automation/editorial/2026-08-27-am", packet, editorial, packetBlobSha: "b".repeat(40),
    });
    expect(errors).toContain("editorial packetBlobSha does not match the restored packet blob");
  });
});
