import { describe, expect, it, vi } from "vitest";
import { edition, sourceReport } from "./brief";
import {
  archivedBriefUrl,
  latestBriefUrl,
  loadArchivedEdition,
  loadBriefManifest,
  loadLatestEdition,
  loadSearchIndex,
  manifestUrl,
  searchIndexUrl,
} from "./briefLoader";
import type { BriefManifest, BriefSearchIndex } from "../types";

const publishedEdition = {
  ...edition,
  schemaVersion: 1 as const,
  sourceReport,
};

const manifest: BriefManifest = {
  schemaVersion: 1,
  updatedAt: edition.generatedAt,
  latest: edition.id,
  editions: [{
    id: edition.id,
    issueNumber: edition.issueNumber,
    date: edition.date,
    period: edition.period,
    generatedAt: edition.generatedAt,
    revised: false,
    path: "archive/2026/08/" + edition.id + ".json",
  }],
};

const searchIndex: BriefSearchIndex = {
  schemaVersion: 1,
  updatedAt: edition.generatedAt,
  entries: [{
    editionId: edition.id,
    issueNumber: edition.issueNumber,
    date: edition.date,
    period: edition.period,
    entryId: edition.entries[0].id,
    titleZhCn: edition.entries[0].title.title_zh_cn,
    titleEn: edition.entries[0].title.title_en,
    headline: edition.entries[0].headline,
    summary: edition.entries[0].summary,
    platforms: edition.entries[0].platforms,
    region: edition.entries[0].region,
    factStatus: edition.entries[0].fact_status,
  }],
};

describe("brief loader", () => {
  it("resolves every data path against the Vite base URL", () => {
    expect(latestBriefUrl("/daily-game-brief/")).toBe(
      "/daily-game-brief/data/latest.json",
    );
    expect(manifestUrl("/daily-game-brief")).toBe(
      "/daily-game-brief/data/manifest.json",
    );
    expect(searchIndexUrl("/daily-game-brief/")).toBe(
      "/daily-game-brief/data/search-index.json",
    );
    expect(archivedBriefUrl(manifest.editions[0], "/daily-game-brief/")).toBe(
      "/daily-game-brief/data/archive/2026/08/" + edition.id + ".json",
    );
  });

  it("loads a valid published edition", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(publishedEdition), { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await loadLatestEdition(undefined, fetcher);

    expect(result.source).toBe("remote");
    expect(result.edition.id).toBe(edition.id);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("falls back when the published payload is invalid", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(edition), { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await loadLatestEdition(undefined, fetcher);

    expect(result.source).toBe("fallback");
    expect(result.edition).toBe(edition);
    expect(result.error).toContain("schemaVersion");
  });

  it("loads the manifest, compact search index, and selected archive", async () => {
    const manifestFetcher = vi.fn(async () =>
      new Response(JSON.stringify(manifest), { status: 200 }),
    ) as unknown as typeof fetch;
    const indexFetcher = vi.fn(async () =>
      new Response(JSON.stringify(searchIndex), { status: 200 }),
    ) as unknown as typeof fetch;
    const archiveFetcher = vi.fn(async () =>
      new Response(JSON.stringify(publishedEdition), { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(loadBriefManifest(undefined, manifestFetcher)).resolves.toEqual(manifest);
    await expect(loadSearchIndex(undefined, indexFetcher)).resolves.toEqual(searchIndex);
    await expect(
      loadArchivedEdition(manifest.editions[0], undefined, archiveFetcher),
    ).resolves.toMatchObject({ id: edition.id });
  });
});
