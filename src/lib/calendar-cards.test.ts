import { describe, expect, it } from "vitest";
import { calendarCards } from "./calendar-cards";
import snapshot from "../../public/data/archive/2026/11/2026-11-11-daily.json";
import type { UpcomingEntry } from "../types";

const records = (snapshot.upcoming as UpcomingEntry[]).filter(item => item.title.title_key === "where-winds-meet");
describe("calendar presentation cards", () => {
  it("groups the PS5 and Xbox Hutuo records without losing their individual evidence or changing Canonical", () => {
    const before = JSON.stringify(records);
    const cards = calendarCards(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].variants).toEqual(records);
    expect(cards[0].variants.map(item => item.platforms)).toEqual([["PlayStation 5"], ["Xbox Series X|S"]]);
    expect(new Set(cards[0].variants.map(item => item.source.url)).size).toBe(2);
    expect(JSON.stringify(records)).toBe(before);
  });
  it("does not collapse release types or infer a shared release event", () => {
    const other = { ...records[1], releaseType: "A separate DLC", note: "Separate evidence" };
    const cards = calendarCards([records[0], other]);
    expect(cards).toHaveLength(1);
    expect(cards[0].variants[1]).toBe(other);
    expect(cards[0].variants[0].releaseType).not.toBe(cards[0].variants[1].releaseType);
  });
  it("keeps different dates, regions, names and missing identities separate", () => {
    for (const changed of [
      { ...records[1], date: "11.14" },
      { ...records[1], region: "Japan" },
      { ...records[1], title: { ...records[1].title, title_en: "Where Winds Meet Deluxe" } },
      { ...records[1], title: { ...records[1].title, title_key: "" } },
      { ...records[1], title: { ...records[1].title, title_zh_cn: "另一版本" } },
    ]) expect(calendarCards([records[0], changed])).toHaveLength(2);
  });
  it("preserves ordering and picks available cover without mutating source records", () => {
    const first = { ...records[0], cover: undefined };
    const other = { ...records[0], id: "another-game", title: { ...records[0].title, title_key: "another-game" } };
    const cards = calendarCards([first, other, records[1]]);
    expect(cards.map(card => card.item.id)).toEqual([first.id, other.id]);
    expect(cards[0].item.cover).toBe(records[1].cover);
    expect(first.cover).toBeUndefined();
    expect(cards[0].variants).toEqual([first, records[1]]);
  });
});
