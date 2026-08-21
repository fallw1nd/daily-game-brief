import type { BriefEdition, BriefEntry, SectionKey } from "../types";

export function entriesForSection(
  entries: BriefEntry[],
  section: SectionKey,
): BriefEntry[] {
  return entries.filter((entry) => entry.section === section);
}

export function isEntryInsideEditionWindow(
  entry: BriefEntry,
  edition: BriefEdition,
): boolean {
  if (entry.entry_flags.includes("supplement")) return false;
  return (
    entry.beijingTime > edition.windowStart &&
    entry.beijingTime <= edition.windowEnd
  );
}

export function validateEdition(edition: BriefEdition): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const entry of edition.entries) {
    if (ids.has(entry.id)) errors.push(`duplicate entry id: ${entry.id}`);
    ids.add(entry.id);

    if (
      entry.fact_status === "official" &&
      !entry.sources.some((source) => source.kind === "primary")
    ) {
      errors.push(`official entry without primary source: ${entry.id}`);
    }
  }

  if (edition.timezone !== "Asia/Shanghai") {
    errors.push("edition timezone must be Asia/Shanghai");
  }

  return errors;
}

export function searchEntries(entries: BriefEntry[], query: string): BriefEntry[] {
  const term = query.trim().toLocaleLowerCase("zh-CN");
  if (!term) return entries;

  return entries.filter((entry) =>
    [
      entry.title.title_zh_cn,
      entry.title.title_en,
      entry.headline,
      entry.summary,
      entry.platforms.join(" "),
      entry.region,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(term),
  );
}
