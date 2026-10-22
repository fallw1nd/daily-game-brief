import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCalendarImportance, buildCalendarInterestHistory } from './lib/calendar-importance.mjs';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export const calendarSnapshot = items => JSON.stringify(items.map(item => [item.id, item.date, item.title.title_key, item.title.title_en, item.platforms, item.source?.url, item.source?.kind]));

export async function buildCalendarFocus({ root = process.cwd(), read = readJson } = {}) {
  const unavailable = { version: 1, status: 'unavailable', editionId: '', snapshot: '', selectedIds: [] };
  try {
    const dataRoot = resolve(root, 'public/data');
    const manifest = await read(resolve(dataRoot, 'manifest.json'));
    const latest = manifest.editions.find(row => row.id === manifest.latest);
    if (!latest) return unavailable;
    const edition = await read(resolve(dataRoot, latest.path));
    if (edition.id !== manifest.latest || !Array.isArray(edition.upcoming)) return unavailable;
    const bound = { ...unavailable, editionId: edition.id, snapshot: calendarSnapshot(edition.upcoming) };
    const config = await read(resolve(root, 'config/release-calendar-sources.json'));
    if (!config.importance?.enabled) return bound;
    const registry = await read(resolve(root, 'config/title-translations.json'));
    const cutoff = new Date(`${edition.date}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() + 1);
    const earliest = cutoff.getTime() - (config.importance.historyLookbackDays || 120) * 86400000;
    const recent = manifest.editions.filter(row => Date.parse(`${row.date}T00:00:00Z`) >= earliest && row.date <= edition.date);
    // A partial history must never masquerade as evidence that a game is unimportant.
    const editions = await Promise.all(recent.map(row => read(resolve(dataRoot, row.path))));
    const history = buildCalendarInterestHistory(editions, { editionDate: cutoff.toISOString().slice(0, 10), lookbackDays: config.importance.historyLookbackDays || 120, titleRegistry: registry });
    if (!history.length) return bound;
    const candidates = edition.upcoming.map(item => ({ id: item.id, title: item.title.title_en || item.title.title_zh_cn, platforms: item.platforms, date: item.date, inBaseline: false }));
    const report = applyCalendarImportance({ editionDate: edition.date, candidates, reviewLinks: [] }, { config, history, historyStatus: 'available' });
    return { ...bound, status: 'available', selectedIds: report.allCandidates.filter(row => row.importance.decision === 'selected').map(row => row.id) };
  } catch (error) {
    console.warn(`Calendar focus unavailable; keeping the recorded calendar visible: ${error.message}`);
    return unavailable;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve('src/generated/calendar-focus.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(await buildCalendarFocus()) + '\n');
}
