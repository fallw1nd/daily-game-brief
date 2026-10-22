import { expect, it } from "vitest";
import { editionsNewestFirst } from "./edition-order";
it("orders a late supplement by its news date without mutating issue allocation order", () => {
  const items = [{ id: "2026-09-27-daily", issueNumber: 47 }, { id: "2026-10-01-daily", issueNumber: 50 }, { id: "2026-09-28-daily", issueNumber: 51 }];
  expect(editionsNewestFirst(items).map(item => item.issueNumber)).toEqual([50, 51, 47]);
  expect(items.map(item => item.issueNumber)).toEqual([47, 50, 51]);
});
