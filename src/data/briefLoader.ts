import { edition as fallbackEdition } from "./brief";
import { validateEdition } from "../lib/brief";
import type { BriefEdition } from "../types";

export type BriefLoadResult = {
  edition: BriefEdition;
  source: "remote" | "fallback";
  error?: string;
};

export function latestBriefUrl(baseUrl = import.meta.env.BASE_URL): string {
  return `${baseUrl}data/latest.json`;
}

export async function loadLatestEdition(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BriefLoadResult> {
  try {
    const response = await fetcher(latestBriefUrl(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      throw new Error(`brief request failed with ${response.status}`);
    }

    const candidate = (await response.json()) as BriefEdition;
    const errors = validateEdition(candidate, { requireEnvelope: true });
    if (errors.length > 0) {
      throw new Error(`brief validation failed: ${errors.join("; ")}`);
    }

    return { edition: candidate, source: "remote" };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      edition: fallbackEdition,
      source: "fallback",
      error: error instanceof Error ? error.message : "unknown brief loading error",
    };
  }
}
