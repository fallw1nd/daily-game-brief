import { describe, expect, it } from "vitest";
import { edition } from "../data/brief";
import {
  isEntryInsideEditionWindow,
  searchArchiveEntries,
  searchEntries,
  validateEdition,
} from "./brief";

describe("brief integrity", () => {
  it("keeps official entries backed by primary sources", () => {
    expect(validateEdition(edition)).toEqual([]);
  });

  it("requires editorial images and covers after the legacy editions", () => {
    const errors = validateEdition({
      ...edition,
      schemaVersion: 2,
      entries: edition.entries.map((entry) => ({ ...entry, images: undefined })),
      upcoming: edition.upcoming.map((item) => ({ ...item, cover: undefined })),
    });

    expect(errors.some((error) => error.includes("image or an unavailable reason"))).toBe(true);
    expect(errors.some((error) => error.includes("cover or an unavailable reason"))).toBe(true);
  });

  it("accepts an explicit reason instead of forcing an unrelated image", () => {
    const errors = validateEdition({
      ...edition,
      schemaVersion: 2,
      entries: edition.entries.map((entry) => ({
        ...entry,
        images: undefined,
        image_status: "unavailable",
        imageNote: "官方页面未提供可独立核验和转载的新闻图片。",
      })),
      upcoming: edition.upcoming.map((item) => ({
        ...item,
        cover: undefined,
        cover_status: "unavailable",
        coverNote: "官方商店暂无可核实封面。",
      })),
    });

    expect(errors).toEqual([]);
  });

  it("excludes supplements from the current time window", () => {
    const supplement = edition.entries.find((entry) =>
      entry.entry_flags.includes("supplement"),
    );

    expect(supplement).toBeDefined();
    expect(isEntryInsideEditionWindow(supplement!, edition)).toBe(false);
  });

  it("uses an open-start, closed-end edition window", () => {
    const base = edition.entries[0];
    expect(
      isEntryInsideEditionWindow(
        { ...base, beijingTime: edition.windowStart },
        edition,
      ),
    ).toBe(false);
    expect(
      isEntryInsideEditionWindow(
        { ...base, beijingTime: edition.windowEnd },
        edition,
      ),
    ).toBe(true);
  });

  it("searches Chinese names, English names, and platforms", () => {
    expect(searchEntries(edition.entries, "乐园追放")).toHaveLength(1);
    expect(searchEntries(edition.entries, "Chronoscript")).toHaveLength(1);
    expect(searchEntries(edition.entries, "Netflix")).toHaveLength(1);
  });

  it("searches compact archive entries across editions", () => {
    const results = searchArchiveEntries([
      {
        editionId: "2026-08-21-am",
        issueNumber: 1,
        date: "2026-08-21",
        period: "am",
        entryId: "story-1",
        titleZhCn: "测试游戏",
        titleEn: "Test Game",
        headline: "确认发售日期",
        summary: "登陆PC与主机平台。",
        platforms: ["PC", "PS5"],
        region: "全球",
        factStatus: "official",
      },
    ], "PS5");

    expect(results).toHaveLength(1);
    expect(results[0].editionId).toBe("2026-08-21-am");
    expect(searchArchiveEntries(results, "")).toEqual([]);
  });
});
