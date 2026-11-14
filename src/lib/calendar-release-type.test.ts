import { describe, expect, it } from "vitest";
import { calendarReleaseType } from "./calendar-release-type";

describe("calendar release type presentation", () => {
  it.each([
    ["game_launch", "游戏发售", "Game launch"],
    ["early_access_launch", "抢先体验上线", "Early Access launch"],
    ["season_update", "赛季更新", "Season update"],
  ])("labels the known %s token in both languages", (value, chinese, english) => {
    expect(calendarReleaseType(value)).toBe(chinese);
    expect(calendarReleaseType(value, true)).toBe(english);
  });

  it.each(["正式发售", "PC版发售", "Early Access", "Season update", "Custom platform release", "unknown_type", "GAME_LAUNCH", " game_launch ", "constructor", ""])("preserves non-token label %j exactly", value => {
    expect(calendarReleaseType(value)).toBe(value);
    expect(calendarReleaseType(value, true)).toBe(value);
  });
});
