import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildEnglishLocaleIndex } from "./lib/locale-index.mjs";

const dataRoot = resolve("public/data");
const manifest = JSON.parse(await readFile(resolve(dataRoot, "manifest.json"), "utf8"));
if (!Array.isArray(manifest.editions)) throw new Error("manifest editions must be an array");

const localeIndex = await buildEnglishLocaleIndex({ write: false });
const localeByEdition = new Map(localeIndex.editions.map((item) => [item.editionId, item]));
const items = [];

for (const manifestItem of [...manifest.editions].reverse()) {
  const edition = JSON.parse(await readFile(resolve(dataRoot, manifestItem.path), "utf8"));
  const localeState = localeByEdition.get(edition.id);
  let overlayByEntry = new Map();
  if (localeState?.status === "available" && localeState.path) {
    const overlay = JSON.parse(await readFile(resolve(dataRoot, localeState.path), "utf8"));
    overlayByEntry = new Map((overlay.entries ?? []).map((entry) => [entry.entryId, entry]));
  }
  for (const entry of edition.entries ?? []) {
    const english = overlayByEntry.get(entry.id);
    items.push({
      editionId: edition.id,
      entryId: entry.id,
      issue: edition.issueNumber,
      date: edition.date,
      period: edition.period,
      section: entry.section,
      tracking: entry.tracking === true,
      availableLocales: english ? ["zh-CN", "en"] : ["zh-CN"],
      titleKey: entry.title?.title_key ?? "",
      titleZhCn: entry.title?.title_zh_cn,
      titleEn: entry.title?.title_en ?? "",
      copy: {
        "zh-CN": {
          subject: entry.title?.title_zh_cn ?? entry.title?.title_en ?? "",
          headline: entry.headline ?? "",
          summary: entry.summary ?? "",
        },
        ...(english ? {
          en: {
            subject: entry.title?.title_en ?? "",
            headline: english.headline,
            summary: english.summary,
          },
        } : {}),
      },
      platforms: entry.platforms ?? [],
      region: entry.region ?? "",
      factStatus: entry.fact_status,
      titleStatus: entry.title?.title_zh_status,
    });
  }
}

const index = { schemaVersion: 2, updatedAt: manifest.updatedAt, items };
await writeFile(resolve(dataRoot, "search-index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");
console.log(`Generated search index v2 with ${items.length} entries from ${manifest.editions.length} editions.`);
