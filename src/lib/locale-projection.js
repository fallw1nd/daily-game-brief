export const FACTS_PROJECTION_VERSION = 1;
export const UPCOMING_KEY_VERSION = 1;

export function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item === undefined ? null : item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function upcomingKey(editionId, item) {
  if (typeof item?.id === "string" && item.id.trim()) return item.id.trim();
  const titleKey = item?.title?.title_key ?? item?.titleKey ?? "unknown-title";
  const date = item?.date ?? "unknown-date";
  const platforms = Array.isArray(item?.platforms) ? item.platforms.join("+") : "";
  return `upcoming-v${UPCOMING_KEY_VERSION}:${editionId}:${titleKey}:${date}:${platforms}`;
}

export function assetKey(ownerId, asset) {
  const kind = asset?.kind ?? "asset";
  const source = asset?.sourceUrl ?? "";
  const url = asset?.url ?? "";
  return `${kind}:${ownerId}:${encodeURIComponent(source)}:${encodeURIComponent(url)}`;
}

export function factsProjection(edition, sharedFactFrameDigests = {}) {
  return {
    factsProjectionVersion: FACTS_PROJECTION_VERSION,
    edition: {
      id: edition.id,
      issueNumber: edition.issueNumber,
      date: edition.date,
      period: edition.period,
      plannedAt: edition.plannedAt,
      windowStart: edition.windowStart,
      windowEnd: edition.windowEnd,
      timezone: edition.timezone,
      leadEntryId: edition.leadEntryId ?? null,
    },
    entries: (edition.entries ?? []).map((entry) => ({
      id: entry.id,
      section: entry.section,
      title_key: entry.title?.title_key ?? null,
      title_en: entry.title?.title_en ?? null,
      beijingTime: entry.beijingTime,
      timeEvidenceAt: entry.timeEvidenceAt ?? null,
      fact_status: entry.fact_status,
      time_status: entry.time_status,
      entry_flags: entry.entry_flags ?? [],
      platforms: entry.platforms ?? [],
      region: entry.region ?? null,
      releaseType: entry.releaseType ?? null,
      tracking: entry.tracking === true,
      sources: (entry.sources ?? []).map((source) => ({
        url: source.url,
        kind: source.kind,
      })),
      sharedFactFrameDigest: sharedFactFrameDigests[entry.id] ?? null,
    })),
    upcoming: (edition.upcoming ?? []).map((item) => ({
      upcomingKey: upcomingKey(edition.id, item),
      date: item.date,
      title_key: item.title?.title_key ?? null,
      title_en: item.title?.title_en ?? null,
      platforms: item.platforms ?? [],
      region: item.region ?? null,
      releaseType: item.releaseType ?? null,
      source: item.source ? { url: item.source.url, kind: item.source.kind } : null,
    })),
  };
}

export function canonicalCopyProjection(edition) {
  return {
    archiveTitle: edition.archiveTitle ?? null,
    entries: (edition.entries ?? []).map((entry) => ({
      id: entry.id,
      headline: entry.headline ?? "",
      summary: entry.summary ?? "",
      verification: entry.verification ?? "",
      timeNote: entry.timeNote ?? "",
    })),
    sourceReport: edition.sourceReport ? {
      checked: edition.sourceReport.checked ?? [],
      limited: edition.sourceReport.limited ?? [],
      note: edition.sourceReport.note ?? "",
    } : null,
  };
}

export function localeProjection(overlay) {
  const { localeDigest: _localeDigest, ...projection } = overlay ?? {};
  return projection;
}

export function editorialDecisionProjection(editorial) {
  if (!editorial || typeof editorial !== "object") return editorial;
  const { locales: _locales, ...projection } = editorial;
  return projection;
}
