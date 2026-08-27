import fs from "node:fs";
import path from "node:path";
import { getRegisteredTitleTranslation } from "./lib/title-translations.mjs";

const archiveRoot = "public/data/archive";
const latestPath = "public/data/latest.json";

function archiveFiles() {
  const files = [];
  for (const year of fs.readdirSync(archiveRoot)) {
    const yearDir = path.join(archiveRoot, year);
    if (!fs.statSync(yearDir).isDirectory()) continue;
    for (const month of fs.readdirSync(yearDir)) {
      const monthDir = path.join(yearDir, month);
      if (!fs.statSync(monthDir).isDirectory()) continue;
      for (const file of fs.readdirSync(monthDir)) {
        if (file.endsWith(".json")) files.push(path.join(monthDir, file));
      }
    }
  }
  return files.sort();
}

function backfillTitle(title, stats) {
  if (!title || title.title_zh_status !== "unavailable") return false;
  const registered = getRegisteredTitleTranslation(title.title_key);
  if (!registered?.titleZhCn || !registered?.titleZhStatus) return false;
  title.title_zh_cn = registered.titleZhCn;
  title.title_zh_status = registered.titleZhStatus;
  stats.occurrences += 1;
  stats.keys.add(title.title_key);
  return true;
}

function backfillDocument(file, stats) {
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = false;
  for (const item of document.entries || []) changed = backfillTitle(item.title, stats) || changed;
  for (const item of document.upcoming || []) changed = backfillTitle(item.title, stats) || changed;
  if (changed) {
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    stats.files += 1;
  }
}

const archiveStats = { files: 0, occurrences: 0, keys: new Set() };
for (const file of archiveFiles()) backfillDocument(file, archiveStats);

const latestStats = { files: 0, occurrences: 0, keys: new Set() };
if (fs.existsSync(latestPath)) backfillDocument(latestPath, latestStats);

console.log(`Title backfill: ${archiveStats.keys.size} unique key(s), ${archiveStats.occurrences} archive occurrence(s), ${archiveStats.files} archive file(s) changed.`);
console.log(`Latest: ${latestStats.occurrences} occurrence(s), changed=${latestStats.files > 0}.`);
