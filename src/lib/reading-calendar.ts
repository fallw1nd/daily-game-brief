import type { BriefEdition, BriefManifest, UpcomingEntry } from "../types";
import { loadArchivedEdition, loadEnglishOverlay } from "../data/briefLoader";
import { validateEnglishOverlayForRender } from "./locale";
import { projectEnglishEdition } from "./english-render";

const day = 86_400_000;

export function calendarDate(value: string, sourceDate: string): string | undefined {
  const short = /^(\d{2})[.-](\d{2})$/.exec(value);
  let iso = value;
  if (short) {
    let year = Number(sourceDate.slice(0, 4));
    if (sourceDate.slice(5, 7) === "12" && short[1] === "01") year += 1;
    iso = `${year}-${short[1]}-${short[2]}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const timestamp = Date.parse(iso + "T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === iso ? iso : undefined;
}

export function calendarWindow(items: UpcomingEntry[], sourceDate: string, editionDate: string): UpcomingEntry[] {
  const start = Date.parse(editionDate + "T00:00:00Z");
  return items.flatMap((item) => {
    const date = calendarDate(item.date, sourceDate);
    const timestamp = date ? Date.parse(date + "T00:00:00Z") : NaN;
    return timestamp > start && timestamp <= start + 15 * day ? [{ ...item, date: date! }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export interface ReadingCalendar { items: UpcomingEntry[]; sourceId: string; sourceDate: string; }

export async function loadReadingCalendar(edition: BriefEdition, manifest: BriefManifest, english: boolean, signal?: AbortSignal): Promise<ReadingCalendar | undefined> {
  const earliest = Date.parse(edition.date + "T00:00:00Z") - 15 * day;
  const candidates = manifest.editions.filter((item) => item.issueNumber < edition.issueNumber && Date.parse(item.date + "T00:00:00Z") >= earliest).sort((a, b) => b.issueNumber - a.issueNumber);
  for (const candidate of candidates) {
    let source = await loadArchivedEdition(candidate, signal);
    if (!source.upcoming.length) continue;
    if (english) {
      const overlay = await loadEnglishOverlay(source.id, signal);
      const validation = await validateEnglishOverlayForRender(source, overlay);
      if (validation.status !== "available") throw new Error("Calendar translation unavailable");
      const projected = projectEnglishEdition(source, overlay);
      if (!projected) throw new Error("Calendar translation unavailable");
      source = projected;
    }
    // Do not resurrect superseded dates from older nonempty snapshots.
    return { items: calendarWindow(source.upcoming, source.date, edition.date), sourceId: source.id, sourceDate: source.date };
  }
  return undefined;
}
