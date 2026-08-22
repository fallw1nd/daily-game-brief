import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const dataRoot = resolve("public/data");
const manifest = JSON.parse(
  await readFile(resolve(dataRoot, "manifest.json"), "utf8"),
);

if (!Array.isArray(manifest.editions)) {
  throw new Error("manifest editions must be an array");
}

const entries = [];

for (const item of [...manifest.editions].reverse()) {
  const edition = JSON.parse(
    await readFile(resolve(dataRoot, item.path), "utf8"),
  );

  for (const entry of edition.entries ?? []) {
    entries.push({
      editionId: edition.id,
      issueNumber: edition.issueNumber,
      date: edition.date,
      period: edition.period,
      entryId: entry.id,
      titleZhCn: entry.title?.title_zh_cn,
      titleEn: entry.title?.title_en ?? "",
      headline: entry.headline ?? "",
      summary: entry.summary ?? "",
      platforms: entry.platforms ?? [],
      region: entry.region ?? "",
      factStatus: entry.fact_status,
    });
  }
}

const index = {
  schemaVersion: 1,
  updatedAt: manifest.updatedAt,
  entries,
};

await writeFile(
  resolve(dataRoot, "search-index.json"),
  JSON.stringify(index, null, 2) + "\n",
  "utf8",
);

console.log(
  `Generated search index with ${entries.length} entries from ${manifest.editions.length} editions.`,
);
