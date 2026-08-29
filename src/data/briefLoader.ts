import { edition as fallbackEdition } from "./brief";
import { validateEdition } from "../lib/brief";
import type {
  BriefEdition,
  BriefManifest,
  BriefManifestItem,
  BriefSearchIndex,
  BriefSearchIndexPayload,
  BriefSearchIndexV2,
  EnglishLocaleIndex,
  EnglishLocaleOverlay,
} from "../types";

export type BriefLoadResult = {
  edition: BriefEdition;
  source: "remote" | "fallback";
  error?: string;
};

function dataUrl(path: string, baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  return `${base}data/${path.replace(/^\/+/, "")}`;
}

export function latestBriefUrl(baseUrl = import.meta.env.BASE_URL): string {
  return dataUrl("latest.json", baseUrl);
}

export function manifestUrl(baseUrl = import.meta.env.BASE_URL): string {
  return dataUrl("manifest.json", baseUrl);
}

export function searchIndexUrl(baseUrl = import.meta.env.BASE_URL): string {
  return dataUrl("search-index.json", baseUrl);
}

export function englishLocaleIndexUrl(baseUrl = import.meta.env.BASE_URL): string {
  return dataUrl("locales/en/index.json", baseUrl);
}

export function englishOverlayUrl(
  editionId: string,
  baseUrl = import.meta.env.BASE_URL,
): string {
  const [year, month] = editionId.split("-");
  return dataUrl(`locales/en/archive/${year}/${month}/${editionId}.json`, baseUrl);
}

export function archivedBriefUrl(
  item: BriefManifestItem,
  baseUrl = import.meta.env.BASE_URL,
): string {
  return dataUrl(item.path, baseUrl);
}

async function fetchJson(
  url: string,
  signal: AbortSignal | undefined,
  fetcher: typeof fetch,
): Promise<unknown> {
  const response = await fetcher(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`request failed with ${response.status}: ${url}`);
  return response.json();
}

function normalizeSearchIndex(candidate: BriefSearchIndexPayload): BriefSearchIndex {
  if (candidate.schemaVersion === 1) return candidate;
  const v2 = candidate as BriefSearchIndexV2;
  return {
    schemaVersion: 1,
    updatedAt: v2.updatedAt,
    entries: v2.items.map((item) => ({
      editionId: item.editionId,
      issueNumber: item.issue,
      ...(item.tracking ? { tracking: true } : {}),
      date: item.date,
      period: item.period,
      entryId: item.entryId,
      titleZhCn: (item as BriefSearchIndexV2["items"][number] & { titleZhCn?: string }).titleZhCn,
      titleEn: (item as BriefSearchIndexV2["items"][number] & { titleEn?: string }).titleEn ?? item.copy.en?.subject ?? item.copy["zh-CN"].subject,
      headline: item.copy["zh-CN"].headline,
      summary: item.copy["zh-CN"].summary,
      platforms: item.platforms,
      region: item.region,
      factStatus: item.factStatus,
    })),
  };
}

export async function loadLatestEdition(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BriefLoadResult> {
  try {
    const candidate = await fetchJson(latestBriefUrl(), signal, fetcher);
    const errors = validateEdition(candidate, { requireEnvelope: true });
    if (errors.length > 0) throw new Error(`brief validation failed: ${errors.join("; ")}`);
    return { edition: candidate as BriefEdition, source: "remote" };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      edition: fallbackEdition,
      source: "fallback",
      error: error instanceof Error ? error.message : "unknown brief loading error",
    };
  }
}

export async function loadBriefManifest(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BriefManifest> {
  const candidate = await fetchJson(manifestUrl(), signal, fetcher);
  if (typeof candidate !== "object" || candidate === null || !Array.isArray((candidate as BriefManifest).editions)) {
    throw new Error("brief manifest is invalid");
  }
  return candidate as BriefManifest;
}

export async function loadSearchIndex(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BriefSearchIndex> {
  const candidate = await fetchJson(searchIndexUrl(), signal, fetcher) as Partial<BriefSearchIndexPayload>;
  if (typeof candidate !== "object" || candidate === null) throw new Error("brief search index is invalid");
  if (candidate.schemaVersion === 1 && Array.isArray((candidate as BriefSearchIndex).entries)) {
    return normalizeSearchIndex(candidate as BriefSearchIndex);
  }
  if (candidate.schemaVersion === 2 && Array.isArray((candidate as BriefSearchIndexV2).items)) {
    return normalizeSearchIndex(candidate as BriefSearchIndexV2);
  }
  throw new Error("brief search index is invalid");
}

export async function loadEnglishLocaleIndex(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<EnglishLocaleIndex> {
  const candidate = await fetchJson(englishLocaleIndexUrl(), signal, fetcher) as EnglishLocaleIndex;
  if (candidate?.schemaVersion !== 1 || candidate.locale !== "en" || !Array.isArray(candidate.editions)) {
    throw new Error("English locale index is invalid");
  }
  return candidate;
}

export async function loadEnglishOverlay(
  editionId: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<EnglishLocaleOverlay> {
  const candidate = await fetchJson(englishOverlayUrl(editionId), signal, fetcher) as EnglishLocaleOverlay;
  if (candidate?.schemaVersion !== 1 || candidate.locale !== "en" || candidate.editionId !== editionId) {
    throw new Error("English locale overlay is invalid");
  }
  return candidate;
}

export async function loadArchivedEdition(
  item: BriefManifestItem,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BriefEdition> {
  const candidate = await fetchJson(archivedBriefUrl(item), signal, fetcher);
  const errors = validateEdition(candidate, { requireEnvelope: true });
  if (errors.length > 0) throw new Error(`archived brief validation failed: ${errors.join("; ")}`);
  return candidate as BriefEdition;
}
