import { describe, expect, it } from "vitest";
import type { GameTitle } from "../types";
import { calendarTitle } from "./calendar-title";

const title = (overrides: Partial<GameTitle> = {}): GameTitle => ({ title_key: "game", title_en: "Original Game", title_zh_cn: "中文游戏", title_zh_status: "official_simplified", ...overrides });
describe("calendar title presentation", () => {
  it.each(["official_simplified", "official_traditional", "common_translation"] as const)("separates %s names from the original", status => {
    expect(calendarTitle(title({ title_zh_status: status }))).toEqual({ primary: "中文游戏", original: "Original Game" });
  });
  it("separates an audited provisional name without changing its provenance", () => {
    const value = title({ title_zh_cn: "中文游戏（Original Game，暂译）", title_zh_status: "provisional_translation" });
    expect(calendarTitle(value)).toEqual({ primary: "中文游戏", original: "Original Game" });
    expect(value.title_zh_status).toBe("provisional_translation");
    expect(value.title_zh_cn).toContain("暂译");
  });
  it("does not invent translations or mistake all provisional names for established English brands", () => {
    expect(calendarTitle(title({ title_zh_status: "unavailable", title_zh_cn: undefined }))).toEqual({ primary: "Original Game" });
    expect(calendarTitle(title({ title_zh_status: "provisional_translation" }))).toEqual({ primary: "中文游戏", original: "Original Game" });
  });
  it("omits duplicate originals, including normalized case", () => {
    expect(calendarTitle(title({ title_zh_cn: "ORIGINAL GAME" }))).toEqual({ primary: "ORIGINAL GAME" });
  });
  it("never strips meaningful parenthetical text or another product's name", () => {
    expect(calendarTitle(title({ title_zh_cn: "中文游戏（特别版）" })).primary).toBe("中文游戏（特别版）");
    expect(calendarTitle(title({ title_zh_status: "provisional_translation", title_zh_cn: "中文游戏（Different Game，暂译）" })).primary).toContain("Different Game");
  });
  it("renders English only in English view even before projection", () => {
    expect(calendarTitle(title(), true)).toEqual({ primary: "Original Game" });
  });
});
