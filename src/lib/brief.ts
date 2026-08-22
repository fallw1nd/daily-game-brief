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

type ValidationOptions = {
  requireEnvelope?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateEdition(
  value: unknown,
  options: ValidationOptions = {},
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["edition must be an object"];

  const edition = value as Partial<BriefEdition>;
  if (options.requireEnvelope && edition.schemaVersion !== 1) {
    errors.push("edition schemaVersion must be 1");
  }
  if (!edition.id || !edition.date || !edition.period) {
    errors.push("edition id, date, and period are required");
  } else if (edition.id !== `${edition.date}-${edition.period}`) {
    errors.push("edition id must match date and period");
  }
  if (!Number.isInteger(edition.issueNumber) || Number(edition.issueNumber) < 1) {
    errors.push("edition issueNumber must be a positive integer");
  }
  if (!Array.isArray(edition.entries)) {
    errors.push("edition entries must be an array");
    return errors;
  }

  const ids = new Set<string>();

  for (const entry of edition.entries) {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      errors.push("every entry must have a string id");
      continue;
    }
    if (ids.has(entry.id)) errors.push(`duplicate entry id: ${entry.id}`);
    ids.add(entry.id);

    if (
      entry.fact_status === "official" &&
      (!Array.isArray(entry.sources) ||
        !entry.sources.some((source) => source.kind === "primary"))
    ) {
      errors.push(`official entry without primary source: ${entry.id}`);
    }
  }

  if (edition.timezone !== "Asia/Shanghai") {
    errors.push("edition timezone must be Asia/Shanghai");
  }

  if (
    options.requireEnvelope &&
    (!edition.sourceReport ||
      !Array.isArray(edition.sourceReport.checked) ||
      !Array.isArray(edition.sourceReport.limited) ||
      typeof edition.sourceReport.note !== "string")
  ) {
    errors.push("edition sourceReport is required");
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
