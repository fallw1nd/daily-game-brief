import { describe, expect, it } from "vitest";
import type { BriefSearchEntry } from "../types";
import { catchupRange, catchupTopics, filterCatchup, topicKey, topicLabel, validCatchupDate } from "./catchup";

function entry(overrides: Partial<BriefSearchEntry> = {}): BriefSearchEntry {
  return {
    editionId: "2026-10-19-daily", issueNumber: 70, date: "2026-10-19", period: "daily", entryId: "story-1",
    titleKey: "game-a", titleZhCn: "游戏甲", titleEn: "Game A", headline: "A verified update", summary: "Archive copy.",
    platforms: ["PC"], region: "全球", factStatus: "official", section: "news", ...overrides,
  };
}

describe("catchup dates", () => {
  it.each(["2026-10-19", "2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"])("accepts real date %s", (date) => {
    expect(validCatchupDate(date)).toBe(true);
  });

  it.each(["", "2026-2-01", "26-01-01", "2026-02-29", "1900-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-10-00", "2026-10-32", "0000-01-01", "2026-10-19T00:00:00Z", " 2026-10-19"])("rejects invalid date %s", (date) => {
    expect(validCatchupDate(date)).toBe(false);
  });

  it("builds inclusive UTC calendar ranges across month, leap-day, year and DST boundaries", () => {
    expect(catchupRange("2026-10-19", 1)).toEqual({ start: "2026-10-19", end: "2026-10-19" });
    expect(catchupRange("2026-10-19", 7)).toEqual({ start: "2026-10-13", end: "2026-10-19" });
    expect(catchupRange("2024-03-01", 3)).toEqual({ start: "2024-02-28", end: "2024-03-01" });
    expect(catchupRange("2026-01-02", 4)).toEqual({ start: "2025-12-30", end: "2026-01-02" });
    expect(catchupRange("2026-03-10", 7)).toEqual({ start: "2026-03-04", end: "2026-03-10" });
    expect(catchupRange("0099-01-02", 2)).toEqual({ start: "0099-01-01", end: "0099-01-02" });
  });

  it("returns an empty range for invalid input or calendar overflow", () => {
    for (const days of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(catchupRange("2026-10-19", days)).toEqual({ start: "", end: "" });
    }
    expect(catchupRange("2026-02-30", 7)).toEqual({ start: "", end: "" });
    expect(catchupRange("", 7)).toEqual({ start: "", end: "" });
    expect(catchupRange("0001-01-01", 2)).toEqual({ start: "", end: "" });
  });
});

describe("catchup topics", () => {
  it("prefers exact canonical keys, retaining distinct entities and historical keys", () => {
    expect(topicKey(entry({ titleKey: " GAME-A " }))).toBe("GAME-A");
    expect(topicKey(entry({ titleKey: "game-a" }))).not.toBe(topicKey(entry({ titleKey: "game-a-announcement" })));
    const game = entry({ titleKey: "game-a", titleEn: "Game A", section: "news" });
    const company = entry({ titleKey: "studio-a", titleEn: "Game A Studio", section: "industry" });
    const event = entry({ titleKey: "game-a-showcase", titleEn: "Game A Showcase", section: "news" });
    expect(catchupTopics([game, company, event], true)).toHaveLength(3);
  });

  it("uses an exact case/whitespace-normalized legacy name without fuzzy aliasing", () => {
    expect(topicKey(entry({ titleKey: undefined, titleEn: "  GAME   A\n" }))).toBe("title:game a");
    expect(topicKey(entry({ titleKey: " ", titleEn: "Game A" }))).toBe("title:game a");
    expect(topicKey(entry({ titleKey: undefined, titleEn: "Game A: Remastered" }))).toBe("title:game a: remastered");
    expect(topicKey(entry({ titleKey: undefined, titleEn: "" }))).toBe("");
    expect(topicKey(entry({ titleKey: undefined, titleEn: "Game-A" }))).not.toBe(topicKey(entry({ titleKey: undefined, titleEn: "Game A" })));
  });

  it("chooses localized display titles with nonempty, non-invented fallbacks", () => {
    expect(topicLabel(entry(), false)).toBe("游戏甲");
    expect(topicLabel(entry(), true)).toBe("Game A");
    expect(topicLabel(entry({ titleZhCn: " " }), false)).toBe("Game A");
    expect(topicLabel(entry({ titleEn: "" }), true)).toBe("游戏甲");
    expect(topicLabel(entry({ titleEn: "", titleZhCn: undefined }), true)).toBe("A verified update");
    expect(topicLabel(entry({ titleEn: "", titleZhCn: undefined, headline: "" }), false)).toBe("未命名主题");
    expect(topicLabel(entry({ titleEn: "", titleZhCn: undefined, headline: "" }), true)).toBe("Untitled topic");
  });

  it("keeps singleton topics, sorts by count then label, and uses the newest label deterministically", () => {
    const entries = [
      entry({ titleEn: "Game A old", date: "2026-10-18" }),
      entry({ titleEn: "Game A latest" }),
      entry({ titleKey: "game-b", titleEn: "Beta" }),
      entry({ titleKey: "game-c", titleEn: "Alpha" }),
      entry({ titleKey: "no-title", titleEn: "", titleZhCn: undefined }),
      entry({ titleKey: undefined, titleEn: "", titleZhCn: undefined }),
    ];
    const result = catchupTopics(entries, true);
    expect(result).toEqual([
      { key: "game-a", label: "Game A latest", count: 2 },
      { key: "no-title", label: "A verified update", count: 1 },
      { key: "game-c", label: "Alpha", count: 1 },
      { key: "game-b", label: "Beta", count: 1 },
    ]);
    expect(catchupTopics([...entries].reverse(), true)).toEqual(result);
  });

  it("breaks equal-label topic ties by key without merging different keys", () => {
    expect(catchupTopics([entry({ titleKey: "b" }), entry({ titleKey: "a" })], true).map((topic) => topic.key)).toEqual(["a", "b"]);
  });
});

describe("catchup filtering", () => {
  const range = { start: "2026-10-13", end: "2026-10-19" };

  it("includes both boundaries, sorts oldest first and leaves the input unchanged", () => {
    const entries = [
      entry({ entryId: "latest", date: "2026-10-19", issueNumber: 3 }),
      entry({ entryId: "before", date: "2026-10-12" }),
      entry({ entryId: "first", date: "2026-10-13", issueNumber: 100 }),
      entry({ entryId: "after", date: "2026-10-20" }),
      entry({ entryId: "middle", date: "2026-10-16", tracking: true }),
      entry({ entryId: "invalid", date: "2026-10-17T00:00:00Z" }),
    ];
    const original = [...entries];
    expect(filterCatchup(entries, range).map((item) => item.entryId)).toEqual(["first", "middle", "latest"]);
    expect(entries).toEqual(original);
  });

  it("orders same-day editions and entry ties deterministically rather than relying on input order", () => {
    const entries = [
      entry({ entryId: "b", period: "daily" }),
      entry({ entryId: "a", period: "pm", editionId: "2026-10-19-pm" }),
      entry({ entryId: "a", period: "daily" }),
      entry({ entryId: "a", period: "am", editionId: "2026-10-19-am" }),
    ];
    const result = filterCatchup(entries, range);
    expect(result.map((item) => `${item.period}:${item.entryId}`)).toEqual(["am:a", "daily:a", "daily:b", "pm:a"]);
    expect(filterCatchup([...entries].reverse(), range)).toEqual(result);
  });

  it("filters by exact topic identity and does not mutate or discard story details", () => {
    const included = entry({ tracking: true, factStatus: "unconfirmed", section: "rumors" });
    const excluded = entry({ titleKey: "game-a-remaster" });
    expect(filterCatchup([included, excluded], { ...range, topic: "game-a" })).toEqual([included]);
    expect(filterCatchup([included], { ...range, topic: "missing" })).toEqual([]);
    expect(filterCatchup([included], { ...range, topic: "" })).toEqual([included]);
  });

  it("returns no results for invalid, reversed or empty date ranges", () => {
    const entries = [entry()];
    expect(filterCatchup(entries, { start: "", end: "2026-10-19" })).toEqual([]);
    expect(filterCatchup(entries, { start: "2026-10-13", end: "" })).toEqual([]);
    expect(filterCatchup(entries, { start: "2026-02-30", end: "2026-10-19" })).toEqual([]);
    expect(filterCatchup(entries, { start: "2026-10-20", end: "2026-10-19" })).toEqual([]);
    expect(filterCatchup([], range)).toEqual([]);
  });
});
