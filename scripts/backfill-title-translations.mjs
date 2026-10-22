import fs from "node:fs";
import path from "node:path";
import { refreshGeneratedEditorialAlts } from "./lib/media-alt.mjs";
import { getRegisteredTitleTranslation, localizeRegisteredTitles } from "./lib/title-translations.mjs";

const archiveRoot = "public/data/archive";
const latestPath = "public/data/latest.json";
const manifestPath = "public/data/manifest.json";

function archiveFiles() {
  const files = [];
  for (const year of fs.readdirSync(archiveRoot)) {
    const yearDir = path.join(archiveRoot, year);
    if (!fs.statSync(yearDir).isDirectory()) continue;
    for (const month of fs.readdirSync(yearDir)) {
      const monthDir = path.join(yearDir, month);
      if (!fs.statSync(monthDir).isDirectory()) continue;
      for (const file of fs.readdirSync(monthDir)) if (file.endsWith(".json")) files.push(path.join(monthDir, file));
    }
  }
  return files.sort();
}

function backfillTitle(title, stats) {
  if (!title || title.title_zh_status !== "unavailable") return false;
  const registered = getRegisteredTitleTranslation(title.title_key, title.title_en);
  if (!registered?.titleZhCn || !registered?.titleZhStatus) return false;
  title.title_zh_cn = registered.titleZhCn;
  title.title_zh_status = registered.titleZhStatus;
  stats.occurrences += 1;
  stats.keys.add(title.title_key);
  return true;
}

function localizeEntry(entry, stats) {
  // A backfill fills missing structured names, not an unrestricted rewrite of
  // every historical headline. Preserve already translated editorial copy.
  if (!backfillTitle(entry.title, stats)) return false;
  let changed = true;
  const registered = getRegisteredTitleTranslation(entry.title.title_key, entry.title.title_en);
  const localize = (text, subject = {}) => localizeRegisteredTitles(text, {
    ...subject,
    translations: { subject: registered },
    titleEn: entry.title.title_en,
    titleZhCn: entry.title.title_zh_cn,
  });
  const next = localize(entry.headline);
  if (next !== entry.headline) {
    entry.headline = next;
    stats.headlines += 1;
    stats.headlineKeys.add(entry.title?.title_key || entry.id);
    changed = true;
  }
  const nextSummary = localize(entry.summary);
  if (nextSummary !== entry.summary) {
    entry.summary = nextSummary;
    stats.summaries += 1;
    changed = true;
  }
  const imageAlts = refreshGeneratedEditorialAlts(entry, localize);
  if (imageAlts) {
    stats.imageAlts += imageAlts;
    changed = true;
  }
  return changed;
}

function backfillDocument(file, stats) {
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = false;
  const filledEntryIds = new Set();
  for (const item of document.entries || []) {
    if (localizeEntry(item, stats)) { filledEntryIds.add(item.id); changed = true; }
  }
  for (const item of document.upcoming || []) changed = backfillTitle(item.title, stats) || changed;
  const lead = (document.entries || []).find((item) => item.id === document.leadEntryId);
  if (lead && filledEntryIds.has(lead.id) && document.archiveTitle) {
    const registered = getRegisteredTitleTranslation(lead.title.title_key, lead.title.title_en);
    const next = localizeRegisteredTitles(document.archiveTitle, { translations: { subject: registered }, titleEn: lead.title.title_en, titleZhCn: lead.title.title_zh_cn });
    if (next !== document.archiveTitle) { document.archiveTitle = next; stats.archiveTitles += 1; changed = true; }
  }
  if (changed) { fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`); stats.files += 1; }
  return document;
}

const makeStats = () => ({ files:0, occurrences:0, keys:new Set(), headlines:0, headlineKeys:new Set(), summaries:0, archiveTitles:0, imageAlts:0 });
const archiveStats = makeStats();
const archiveDocs = new Map();
for (const file of archiveFiles()) { const doc = backfillDocument(file, archiveStats); archiveDocs.set(doc.id, doc); }
const latestStats = makeStats();
if (fs.existsSync(latestPath)) backfillDocument(latestPath, latestStats);

let manifestChanged = false;
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const item of manifest.editions || []) {
    const archive = archiveDocs.get(item.id);
    if (archive?.archiveTitle && item.archiveTitle !== archive.archiveTitle) { item.archiveTitle = archive.archiveTitle; manifestChanged = true; }
  }
  if (manifestChanged) fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(`Title backfill: ${archiveStats.keys.size} key(s), ${archiveStats.occurrences} title occurrence(s), ${archiveStats.headlines} headline(s), ${archiveStats.summaries} summary(s), ${archiveStats.archiveTitles} archive title(s), ${archiveStats.imageAlts} generated image alt(s), ${archiveStats.files} archive file(s).`);
console.log(`Latest: ${latestStats.occurrences} title(s), ${latestStats.headlines} headline(s), ${latestStats.summaries} summary(s), ${latestStats.archiveTitles} archive title(s), ${latestStats.imageAlts} generated image alt(s), changed=${latestStats.files > 0}.`);
console.log(`Manifest changed=${manifestChanged}.`);
