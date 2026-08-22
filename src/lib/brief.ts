import type {
  BriefEdition,
  BriefEntry,
  BriefSearchEntry,
  SectionKey,
} from "../types";

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

function hasUsableImage(value: unknown, kind: "editorial" | "cover"): boolean {
  if (!isRecord(value) || value.placeholder === true) return false;
  return (
    typeof value.url === "string" &&
    value.url.length > 0 &&
    typeof value.alt === "string" &&
    value.alt.length > 0 &&
    typeof value.credit === "string" &&
    value.credit.length > 0 &&
    typeof value.sourceUrl === "string" &&
    /^https:\/\//.test(value.sourceUrl) &&
    value.kind === kind
  );
}

export function validateEdition(
  value: unknown,
  options: ValidationOptions = {},
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["edition must be an object"];

  const edition = value as Partial<BriefEdition>;
  if (options.requireEnvelope && edition.schemaVersion !== 1 && edition.schemaVersion !== 2) {
    errors.push("edition schemaVersion must be 1 or 2");
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
    if (edition.schemaVersion === 2) {
      const hasImage =
        Array.isArray(entry.images) &&
        entry.images.some((asset) => hasUsableImage(asset, "editorial"));
      const explainsAbsence =
        entry.image_status === "unavailable" &&
        typeof entry.imageNote === "string" &&
        entry.imageNote.trim().length > 0;

      if (!hasImage && !explainsAbsence) {
        errors.push(`entry needs an editorial image or an unavailable reason: ${entry.id}`);
      }
    }
  }

  if (edition.schemaVersion === 2 && Array.isArray(edition.upcoming)) {
    for (const item of edition.upcoming) {
      const explainsAbsence =
        item.cover_status === "unavailable" &&
        typeof item.coverNote === "string" &&
        item.coverNote.trim().length > 0;

      if (!hasUsableImage(item.cover, "cover") && !explainsAbsence) {
        errors.push(`upcoming needs a cover or an unavailable reason: ${item.id}`);
      }
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

export function searchArchiveEntries(
  entries: BriefSearchEntry[],
  query: string,
): BriefSearchEntry[] {
  const term = query.trim().toLocaleLowerCase("zh-CN");
  if (!term) return [];

  return entries.filter((entry) =>
    [
      entry.titleZhCn,
      entry.titleEn,
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
