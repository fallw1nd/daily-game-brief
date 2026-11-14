// Presentation-only labels for tokens already stored in the release calendar.
// Keep free-form editorial descriptions and localized labels unchanged.
const releaseTypeLabels = new Map<string, readonly [string, string]>([
  ["game_launch", ["游戏发售", "Game launch"]],
  ["early_access_launch", ["抢先体验上线", "Early Access launch"]],
  ["season_update", ["赛季更新", "Season update"]],
]);

export function calendarReleaseType(value: string, english = false): string {
  return releaseTypeLabels.get(value)?.[english ? 1 : 0] ?? value;
}
