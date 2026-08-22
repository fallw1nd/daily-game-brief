import { edition as fallbackEdition } from "./brief";
import { validateEdition } from "../lib/brief";
import type {
  BriefEdition,
  BriefManifest,
  BriefManifestItem,
  BriefSearchIndex,
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

export async function loadLatestEdition(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BriefLoadResult> {
  try {
    const candidate = await fetchJson(latestBriefUrl(), signal, fetcher);
    const errors = validateEdition(candidate, { requireEnvelope: true });
    if (errors.length > 0) {
      throw new Error(`brief validation failed: ${errors.join("; ")}`);
    }

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
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !Array.isArray((candidate as BriefManifest).editions)
  ) {
    throw new Error("brief manifest is invalid");
  }
  return candidate as BriefManifest;
}

export async function loadSearchIndex(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BriefSearchIndex> {
  const candidate = await fetchJson(searchIndexUrl(), signal, fetcher);
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    (candidate as BriefSearchIndex).schemaVersion !== 1 ||
    !Array.isArray((candidate as BriefSearchIndex).entries)
  ) {
    throw new Error("brief search index is invalid");
  }
  return candidate as BriefSearchIndex;
}

export async function loadArchivedEdition(
  item: BriefManifestItem,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BriefEdition> {
  const candidate = await fetchJson(archivedBriefUrl(item), signal, fetcher);
  const errors = validateEdition(candidate, { requireEnvelope: true });
  if (errors.length > 0) {
    throw new Error(`archived brief validation failed: ${errors.join("; ")}`);
  }
  return candidate as BriefEdition;
}
