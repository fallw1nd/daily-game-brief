import { describe, expect, it, vi } from "vitest";
import { edition, sourceReport } from "./brief";
import {
  archivedBriefUrl,
  englishLocaleIndexUrl,
  englishOverlayUrl,
  latestBriefUrl,
  loadArchivedEdition,
  loadBriefManifest,
  loadLatestEdition,
  loadSearchIndex,
  manifestUrl,
  searchIndexUrl,
} from "./briefLoader";
import type { BriefManifest, BriefSearchIndex, BriefSearchIndexV2 } from "../types";
import { loadEnglishSearchIndex } from "./englishLoader";

const publishedEdition = { ...edition, schemaVersion: 1 as const, sourceReport };
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
const searchIndexV2: BriefSearchIndexV2 = {
  schemaVersion: 2,
  updatedAt: edition.generatedAt,
  items: [{
    editionId: edition.id,
    entryId: edition.entries[0].id,
    issue: edition.issueNumber,
    date: edition.date,
    period: edition.period,
    section: edition.entries[0].section,
    tracking: false,
    availableLocales: ["zh-CN"],
    titleKey: edition.entries[0].title.title_key,
    titleZhCn: edition.entries[0].title.title_zh_cn,
    titleEn: edition.entries[0].title.title_en,
    copy: {
      "zh-CN": {
        subject: edition.entries[0].title.title_zh_cn ?? edition.entries[0].title.title_en,
        headline: edition.entries[0].headline,
        summary: edition.entries[0].summary,
      },
    },
    platforms: edition.entries[0].platforms,
    region: edition.entries[0].region,
    factStatus: edition.entries[0].fact_status,
    titleStatus: edition.entries[0].title.title_zh_status,
  }],
};

describe("brief loader", () => {
  it("resolves canonical and locale data paths against the Vite base URL", () => {
    expect(latestBriefUrl("/daily-game-brief/")).toBe("/daily-game-brief/data/latest.json");
    expect(manifestUrl("/daily-game-brief")).toBe("/daily-game-brief/data/manifest.json");
    expect(searchIndexUrl("/daily-game-brief/")).toBe("/daily-game-brief/data/search-index.json");
    expect(englishLocaleIndexUrl("/daily-game-brief/")).toBe("/daily-game-brief/data/locales/en/index.json");
    expect(englishOverlayUrl("2026-08-29-am", "/daily-game-brief/")).toBe("/daily-game-brief/data/locales/en/archive/2026/08/2026-08-29-am.json");
    expect(archivedBriefUrl(manifest.editions[0], "/daily-game-brief/")).toBe("/daily-game-brief/data/archive/2026/08/" + edition.id + ".json");
  });

  it("loads a valid published edition", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(publishedEdition), { status: 200 })) as unknown as typeof fetch;
    const result = await loadLatestEdition(undefined, fetcher);
    expect(result.source).toBe("remote");
    expect(result.edition.id).toBe(edition.id);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("falls back when the published payload is invalid", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(edition), { status: 200 })) as unknown as typeof fetch;
    const result = await loadLatestEdition(undefined, fetcher);
    expect(result.source).toBe("fallback");
    expect(result.edition).toBe(edition);
    expect(result.error).toContain("schemaVersion");
  });

  it("reads both v1 and v2 search indexes through the current Chinese compatibility view", async () => {
    const v1Fetcher = vi.fn(async () => new Response(JSON.stringify(searchIndex), { status: 200 })) as unknown as typeof fetch;
    const v2Fetcher = vi.fn(async () => new Response(JSON.stringify(searchIndexV2), { status: 200 })) as unknown as typeof fetch;
    await expect(loadSearchIndex(undefined, v1Fetcher)).resolves.toEqual(searchIndex);
    await expect(loadSearchIndex(undefined, v2Fetcher)).resolves.toEqual({
      ...searchIndex,
      entries: [{ ...searchIndex.entries[0], titleKey: searchIndexV2.items[0].titleKey, section: searchIndexV2.items[0].section, titleStatus: searchIndexV2.items[0].titleStatus }],
    });
  });

  it("preserves topic identities and sections in the English compatibility view", async () => {
    const item = searchIndexV2.items[0];
    const englishCopy = { subject: item.titleEn, headline: "English headline", summary: "English summary" };
    const payload: BriefSearchIndexV2 = {
      ...searchIndexV2,
      items: [
        { ...item, tracking: true, availableLocales: ["zh-CN", "en"], copy: { ...item.copy, en: englishCopy } },
        { ...item, entryId: "no-english-copy", availableLocales: ["zh-CN", "en"] },
        { ...item, entryId: "unavailable-english", copy: { ...item.copy, en: englishCopy } },
      ],
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    await expect(loadEnglishSearchIndex(undefined, fetcher)).resolves.toEqual({
      schemaVersion: 1,
      updatedAt: payload.updatedAt,
      entries: [{
        editionId: item.editionId, issueNumber: item.issue, tracking: true, date: item.date, period: item.period,
        entryId: item.entryId, titleKey: item.titleKey, section: item.section, titleStatus: item.titleStatus, titleEn: item.titleEn,
        headline: englishCopy.headline, summary: englishCopy.summary, platforms: item.platforms,
        region: item.region, factStatus: item.factStatus,
      }],
    });
  });

  it("does not treat Chinese v1 copy as an English search archive", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(searchIndex), { status: 200 })) as unknown as typeof fetch;
    await expect(loadEnglishSearchIndex(undefined, fetcher)).resolves.toEqual({ schemaVersion: 1, updatedAt: "", entries: [] });
  });

  it("loads the manifest and selected archive", async () => {
    const manifestFetcher = vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 })) as unknown as typeof fetch;
    const archiveFetcher = vi.fn(async () => new Response(JSON.stringify(publishedEdition), { status: 200 })) as unknown as typeof fetch;
    await expect(loadBriefManifest(undefined, manifestFetcher)).resolves.toEqual(manifest);
    await expect(loadArchivedEdition(manifest.editions[0], undefined, archiveFetcher)).resolves.toMatchObject({ id: edition.id });
  });
});
