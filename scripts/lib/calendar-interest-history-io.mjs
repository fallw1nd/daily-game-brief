import { readFile } from 'node:fs/promises';
import { buildCalendarInterestHistory } from './calendar-importance.mjs';

export async function loadCalendarInterestHistory({ manifest, editionDate, titleRegistry, lookbackDays = 120 }) {
  const editions = [];
  let failures = 0;
  for (const edition of manifest.editions || []) {
    const age = (Date.parse(editionDate) - Date.parse(edition.date)) / 86400000;
    if (!(age > 0 && age <= lookbackDays)) continue;
    if (!/^archive\/\d{4}\/\d{2}\/[\w-]+\.json$/.test(edition.path || '')) { failures++; continue; }
    try { editions.push(JSON.parse(await readFile(`public/data/${edition.path}`, 'utf8'))); }
    catch { failures++; }
  }
  const history = buildCalendarInterestHistory(editions, { editionDate, lookbackDays, titleRegistry });
  return { history, historyStatus: failures ? 'partial' : history.length ? 'available' : 'cold-start' };
}
