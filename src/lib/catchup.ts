import type { BriefSearchEntry, EditionPeriod } from "../types";

export interface CatchupRange { start: string; end: string; }
export interface CatchupFilter extends CatchupRange { topic?: string; }
export interface CatchupTopic { key: string; label: string; count: number; }

const dayMilliseconds = 24 * 60 * 60 * 1000;
const periodOrder: Record<EditionPeriod, number> = { am: 0, daily: 1, pm: 2 };

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Only real, four-digit Gregorian calendar dates are accepted. */
export function validCatchupDate(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A seven-day range includes the end date and the six preceding UTC dates. */
export function catchupRange(end: string, days: number): CatchupRange {
  if (!validCatchupDate(end) || !Number.isSafeInteger(days) || days < 1) return { start: "", end: "" };
  const startDate = new Date(new Date(`${end}T00:00:00.000Z`).getTime() - (days - 1) * dayMilliseconds);
  if (!Number.isFinite(startDate.getTime())) return { start: "", end: "" };
  const start = startDate.toISOString().slice(0, 10);
  return validCatchupDate(start) ? { start, end } : { start: "", end: "" };
}

/** Canonical identities win; legacy names are exact except for case/whitespace. */
export function topicKey(entry: BriefSearchEntry): string {
  const canonical = entry.titleKey?.trim();
  if (canonical) return canonical;
  const title = entry.titleEn.trim().normalize("NFC").replace(/\s+/g, " ").toLowerCase();
  return title ? `title:${title}` : "";
}

export function topicLabel(entry: BriefSearchEntry, english: boolean): string {
  const preferred = english ? entry.titleEn : entry.titleZhCn;
  const fallback = english ? entry.titleZhCn : entry.titleEn;
  return preferred?.trim() || fallback?.trim() || entry.headline.trim() || (english ? "Untitled topic" : "未命名主题");
}

function oldestFirst(a: BriefSearchEntry, b: BriefSearchEntry): number {
  return compareText(a.date, b.date)
    || periodOrder[a.period] - periodOrder[b.period]
    || compareText(a.editionId, b.editionId)
    || compareText(a.entryId, b.entryId)
    || a.issueNumber - b.issueNumber
    || compareText(topicKey(a), topicKey(b))
    || compareText(a.headline, b.headline);
}

/** All supplied topics are retained, including companies and events as themselves. */
export function catchupTopics(entries: readonly BriefSearchEntry[], english: boolean): CatchupTopic[] {
  const topics = new Map<string, { entry: BriefSearchEntry; count: number }>();
  for (const entry of entries) {
    const key = topicKey(entry);
    if (!key) continue;
    const existing = topics.get(key);
    if (existing) {
      existing.count += 1;
      // Prefer the latest published label, independent of input order.
      if (oldestFirst(existing.entry, entry) < 0) existing.entry = entry;
    } else {
      topics.set(key, { entry, count: 1 });
    }
  }
  return [...topics].map(([key, { entry, count }]) => ({ key, label: topicLabel(entry, english), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, english ? "en" : "zh-CN") || compareText(a.key, b.key));
}

/** Inclusive archive dates, not generation timestamps or late issue allocation. */
export function filterCatchup(entries: readonly BriefSearchEntry[], { start, end, topic }: CatchupFilter): BriefSearchEntry[] {
  if (!validCatchupDate(start) || !validCatchupDate(end) || start > end) return [];
  return entries.filter((entry) => validCatchupDate(entry.date)
    && entry.date >= start && entry.date <= end
    && (!topic || topicKey(entry) === topic))
    .sort(oldestFirst);
}
