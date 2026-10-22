import { useEffect, useState } from "react";
import generated from "../generated/calendar-focus.json";
import type { UpcomingEntry } from "../types";

export function calendarSnapshot(items: UpcomingEntry[]): string {
  return JSON.stringify(items.map(item => [item.id, item.date, item.title.title_key, item.title.title_en, item.platforms, item.source?.url, item.source?.kind]));
}

export function resolveCalendarFocus(items: UpcomingEntry[], editionId?: string, latestId?: string, metadata: unknown = generated) {
  if (!editionId || !latestId || editionId !== latestId) return { status: "archive" as const, selected: items };
  const value = metadata as { version?: unknown; status?: unknown; editionId?: unknown; snapshot?: unknown; selectedIds?: unknown } | null;
  if (!value || value.version !== 1 || value.status !== "available" || value.editionId !== editionId || value.snapshot !== calendarSnapshot(items) || !Array.isArray(value.selectedIds) || value.selectedIds.some(id => typeof id !== "string" || !items.some(item => item.id === id)) || new Set(value.selectedIds).size !== value.selectedIds.length) return { status: "unavailable" as const, selected: items };
  const ids = new Set(value.selectedIds);
  return { status: "available" as const, selected: items.filter(item => ids.has(item.id)) };
}

export function useCalendarFocus(items: UpcomingEntry[], editionId?: string, latestId?: string) {
  const [expandedKey, setExpandedKey] = useState<string>();
  const result = resolveCalendarFocus(items, editionId, latestId);
  const key = `${editionId}:${calendarSnapshot(items)}`;
  useEffect(() => setExpandedKey(undefined), [key]);
  const expanded = expandedKey === key;
  return { ...result, expanded, items: result.status === "available" && !expanded ? result.selected : items, total: items.length, toggle: () => setExpandedKey(expanded ? undefined : key) };
}
