import type { BriefEdition, BriefEntry } from "../types";

export function readingLead(edition: BriefEdition): BriefEntry | undefined {
  return edition.entries.find((entry) => entry.id === edition.leadEntryId)
    ?? edition.entries.find((entry) => entry.section === "focus")
    ?? edition.entries[0];
}

export function readingWindow(edition: BriefEdition): string {
  return `${edition.windowStart} → ${edition.windowEnd} (${edition.timezone})`;
}

export function readingHref(editionId?: string, entryId?: string, english = false): string {
  const params = new URLSearchParams({ view: "reading" });
  if (editionId) params.set("edition", editionId);
  if (english) params.set("lang", "en");
  return `${import.meta.env.BASE_URL}?${params}${entryId ? `#${encodeURIComponent(entryId)}` : ""}`;
}
