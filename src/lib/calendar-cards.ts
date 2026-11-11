import type { UpcomingEntry } from "../types";

export interface CalendarCard {
  item: UpcomingEntry;
  variants: UpcomingEntry[];
}

// Presentation grouping only: never rewrite Canonical IDs or infer a shared event.
// Every platform's release type, note and source stays attached to its own row.
export function calendarCards(items: UpcomingEntry[]): CalendarCard[] {
  const cards: CalendarCard[] = [];
  const groups = new Map<string, CalendarCard>();
  for (const item of items) {
    const { title_key, title_en, title_zh_cn } = item.title;
    // Require both a stable identity and the exact original name. Incomplete
    // legacy records and conflicting titles are deliberately kept separate.
    const key = title_key?.trim() && title_en?.trim() && item.date && item.region
      ? JSON.stringify([title_key, title_en, title_zh_cn ?? "", item.date, item.region])
      : undefined;
    const existing = key ? groups.get(key) : undefined;
    if (existing) {
      existing.variants.push(item);
      if ((!existing.item.cover || existing.item.cover.placeholder) && item.cover && !item.cover.placeholder) {
        existing.item = { ...existing.item, cover: item.cover, cover_status: item.cover_status };
      }
    } else {
      const card = { item, variants: [item] };
      cards.push(card);
      if (key) groups.set(key, card);
    }
  }
  return cards;
}
