import { expect, it } from "vitest";
import { validateShowcaseData } from "./lib/showcase-data-validation.mjs";

it("accepts legacy archives and checks optional showcase links and completion", () => {
  expect(validateShowcaseData({ entries: [] })).toEqual([]);
  const edition = { entries: [{ id: "e1", showcaseBrief: true, showcaseRefs: [{ showcaseId: "direct", announcementId: "game-demo", factIds: ["demo"] }] }], showcases: [{ id: "direct", title: "直面会", titleEn: "Direct", total: 2, covered: 1, status: "partial", entryIds: ["e1"] }] };
  expect(validateShowcaseData(edition)).toEqual([]);
  edition.showcases[0].status = "complete";
  expect(validateShowcaseData(edition)).toContain("direct: complete status contradicts coverage");
  edition.showcases[0].entryIds = ["missing"];
  expect(validateShowcaseData(edition)).toContain("direct: invalid entry links");
  edition.entries[0].showcaseRefs[0].factIds.push("demo");
  expect(validateShowcaseData(edition)).toContain("e1: invalid fact identities");
});
