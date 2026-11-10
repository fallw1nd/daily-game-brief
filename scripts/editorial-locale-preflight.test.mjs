import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { englishEditorialWarnings, readEnglishEditorialWarnings } from "./lib/editorial-locale-preflight.mjs";
import { sourcesFor } from "./lib/edition-publisher.mjs";
import { buildEnglishOverlay } from "./lib/bilingual-publisher.mjs";

function scenario() {
  const source = (sourceIndex, url) => ({ sourceIndex, label: "合成自定义来源", url, kind: "primary" });
  const packet = { editorialInput: { packages: [{ eventKey: "game", sources: [
    source(0, "https://example.com/unused"), source(2, "https://example.com/game"),
  ] }] } };
  const editorial = {
    contractVersion: 2, editionId: "2026-11-10-daily", upcoming: [],
    decisions: [{ eventKey: "game", decision: "include", section: "news", sourceIndexes: [2], additionalSources: [] }],
    locales: { en: { schemaVersion: 1, locale: "en", archiveTitle: "Daily Brief | Example Game Update", upcoming: [], sourceReport: null,
      entries: [{ eventKey: "game", headline: "Example Game Announces an Update", summary: "The official source confirms a new update for Example Game.", verification: "The official source was opened and verified.", timeNote: "Inside the fixed edition window.", sourceLabels: [{ sourceIndex: 0, label: "Example Source" }] }],
    } },
  };
  const canonical = {
    schemaVersion: 2, id: editorial.editionId, issueNumber: 92, date: "2026-11-10", period: "daily",
    windowStart: "2026-11-09 10:10", windowEnd: "2026-11-10 10:10", timezone: "Asia/Shanghai",
    archiveTitle: "日报｜Example Game 公布更新", leadEntryId: "2026-11-10-daily-news-0", upcoming: [], tracking: [],
    entries: [{ id: "2026-11-10-daily-news-0", section: "news", title: { title_key: "game", title_en: "Example Game", title_zh_status: "unavailable" },
      headline: "Example Game 公布更新", summary: "官方确认更新内容。", verification: "一手确认。", timeNote: "固定窗口。",
      fact_status: "official", time_status: "verified", beijingTime: "2026-11-10 09:00", platforms: [], region: "Global", releaseType: "News",
      sources: sourcesFor(editorial.decisions[0], packet.editorialInput.packages[0]), sharedFactFrameDigest: `sha256:${"1".repeat(64)}`,
    }],
  };
  const previousOverlay = buildEnglishOverlay({ canonical, editorial }).overlay;
  return { packet, editorial, previousCanonical: canonical, previousOverlay };
}

describe("nonblocking English submission preflight", () => {
  it("uses Canonical index 0 when only packet source 2 was selected, without rewriting the draft", () => {
    const input = scenario();
    expect(input.previousOverlay).not.toBeNull();
    expect(englishEditorialWarnings(input)).toEqual([]);
    input.editorial.locales.en.entries[0].sourceLabels[0].sourceIndex = 2;
    const before = structuredClone(input);
    const warnings = englishEditorialWarnings(input);
    expect(warnings).toContainEqual(expect.stringContaining("sourceIndex does not resolve"));
    expect(warnings).toContainEqual(expect.stringContaining("source 0 needs an English source label"));
    expect(warnings).toContainEqual(expect.stringContaining("0=https://example.com/game"));
    expect(input).toEqual(before);
  });

  it("shares packet ordering, canonical URLs, deduplication and HTTPS filtering with publication", () => {
    const input = scenario();
    const pkg = input.packet.editorialInput.packages[0];
    pkg.sources[0].canonicalUrl = "https://example.com/first/#fragment";
    pkg.sources.push({ ...pkg.sources[1], sourceIndex: 5, canonicalUrl: "https://example.com/first/" });
    const decision = input.editorial.decisions[0];
    decision.sourceIndexes = [5, 2, 0];
    decision.additionalSources = [
      { url: "https://example.com/game/#duplicate", label: "Duplicate" },
      { url: "http://example.com/ignored", label: "Ignored" },
      { url: "https://example.com/extra", label: "额外合成来源" },
    ];
    const urls = sourcesFor(decision, pkg).map(source => source.url);
    expect(urls).toEqual(["https://example.com/first/#fragment", "https://example.com/game", "https://example.com/extra"]);
    input.editorial.locales.en.entries[0].sourceLabels = urls.map((url, sourceIndex) => ({ sourceIndex, label: "Reviewed Source" }));
    expect(englishEditorialWarnings(input)).toEqual([]);
    input.editorial.locales.en.entries[0].sourceLabels.push({ sourceIndex: 0, label: "Duplicate Source" });
    expect(englishEditorialWarnings(input)).toContainEqual(expect.stringContaining("duplicate sourceIndex"));
  });

  it("needs no explicit source label for a programmatically translated source", () => {
    const input = scenario();
    input.packet.editorialInput.packages[0].sources[1].label = "Steam商店";
    input.editorial.locales.en.entries[0].sourceLabels = [];
    expect(englishEditorialWarnings(input)).toEqual([]);
  });

  it.each(["missing", "partial", "wrong-edition", "stale"])("warns about a %s continuation baseline without requiring historical entries in the draft", kind => {
    const input = scenario();
    input.packet.continuation = { scope: "calendar", preservePublished: true };
    input.editorial.decisions = [];
    input.editorial.locales.en.entries = [];
    expect(englishEditorialWarnings(input)).toEqual([]);
    if (kind === "missing") input.previousOverlay = null;
    if (kind === "partial") input.previousOverlay.entries = [];
    if (kind === "wrong-edition") input.previousOverlay.editionId = "2026-11-09-daily";
    if (kind === "stale") input.previousOverlay.factsDigest = `sha256:${"0".repeat(64)}`;
    expect(englishEditorialWarnings(input)).toEqual([expect.stringContaining("no complete valid same-edition baseline")]);
  });

  it("reads retained presentation only as the publisher's missing-archive fallback", async () => {
    const root = await mkdtemp(join(tmpdir(), "english-preflight-"));
    try {
      const input = scenario();
      input.packet.continuation = { scope: "news", preservePublished: true };
      const save = async (prefix, value) => {
        const dir = join(root, prefix, "2026/11"); await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "2026-11-10-daily.json"), JSON.stringify(value));
      };
      await save("archive", input.previousCanonical);
      await save("locales/en/status", { retainedPresentation: input.previousOverlay });
      expect(await readEnglishEditorialWarnings({ ...input, dataRoot: root })).toEqual([]);
      await save("locales/en/archive", { ...input.previousOverlay, entries: [] });
      expect(await readEnglishEditorialWarnings({ ...input, dataRoot: root })).toEqual([expect.stringContaining("no complete valid same-edition baseline")]);
      await writeFile(join(root, "locales/en/archive/2026/11/2026-11-10-daily.json"), "invalid json");
      expect(await readEnglishEditorialWarnings({ ...input, dataRoot: root })).toContainEqual(expect.stringContaining("English baseline could not be read"));
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("keeps missing English quiet and malformed preflight advisory", () => {
    const input = scenario();
    input.editorial.locales = {};
    expect(englishEditorialWarnings(input)).toEqual([]);
    input.editorial.locales.en = { entries: {} };
    expect(englishEditorialWarnings(input)).toContainEqual(expect.stringContaining("could not finish"));
  });
});
