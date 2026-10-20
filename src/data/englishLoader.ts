import type { BriefSearchIndex, BriefSearchIndexPayload, BriefSearchIndexV2 } from "../types";
import { fetchJson } from "./fetchJson";

function dataUrl(path: string, baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  return `${base}data/${path.replace(/^\/+/, "")}`;
}

export async function loadEnglishSearchIndex(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BriefSearchIndex> {
  const candidate = await fetchJson(dataUrl("search-index.json"), signal, fetcher) as BriefSearchIndexPayload;
  if (candidate.schemaVersion !== 2 || !Array.isArray((candidate as BriefSearchIndexV2).items)) {
    return { schemaVersion: 1, updatedAt: "", entries: [] };
  }
  const v2 = candidate as BriefSearchIndexV2;
  return {
    schemaVersion: 1,
    updatedAt: v2.updatedAt,
    entries: v2.items.flatMap((item) => {
      const copy = item.copy.en;
      if (!copy || !item.availableLocales.includes("en")) return [];
      return [{
        editionId: item.editionId,
        issueNumber: item.issue,
        ...(item.tracking ? { tracking: true } : {}),
        date: item.date,
        period: item.period,
        entryId: item.entryId,
        titleKey: item.titleKey,
        section: item.section,
      titleStatus: item.titleStatus,
        titleEn: item.titleEn,
        headline: copy.headline,
        summary: copy.summary,
        platforms: item.platforms,
        region: item.region,
        factStatus: item.factStatus,
      }];
    }),
  };
}
