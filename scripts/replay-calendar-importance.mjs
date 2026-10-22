import { readFile } from 'node:fs/promises';
import { applyCalendarImportance, buildCalendarInterestHistory } from './lib/calendar-importance.mjs';
import { aggregateCalendarLeads } from './lib/release-calendar-identity.mjs';
import { leadPlatformFamilies } from './lib/release-calendar-selection.mjs';
import { officialCalendarUrl } from './lib/calendar-primary-evidence.mjs';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const [config, titleRegistry, manifest] = await Promise.all(['config/release-calendar-sources.json', 'config/title-translations.json', 'public/data/manifest.json'].map(read));
const editions = await Promise.all(manifest.editions.map(edition => read(`public/data/${edition.path}`)));
const urls = report => new Set([...(report.reviewLinks || []).map(row => row.url), ...(report.admittedCandidates || report.allCandidates || report.candidates || []).flatMap(row => [row.url, ...(row.sourceUrls || []), ...(row.observations || []).flatMap(obs => [obs.url, obs.announcementUrl])])].map(officialCalendarUrl).filter(Boolean)).size;
const results = [];
for (const fixture of process.argv.slice(2).length ? process.argv.slice(2) : ['daily18', 'daily19', 'daily21', 'daily30']) {
  if (!/^daily\d+$/.test(fixture)) throw new Error('Expected a checked-in daily fixture name');
  const raw = await read(`scripts/fixtures/release-calendar/${fixture}/report.json`);
  const grouped = aggregateCalendarLeads(raw.allCandidates || raw.candidates, { titleRegistry });
  const report = { ...raw, candidates: grouped, allCandidates: grouped };
  const history = buildCalendarInterestHistory(editions, { editionDate: report.editionDate, titleRegistry, lookbackDays: config.importance.historyLookbackDays });
  const gated = applyCalendarImportance(report, { config, history });
  results.push({ fixture, editionDate: report.editionDate, originalRows: raw.candidates.length, beforeUniqueTasks: grouped.length, beforeOfficialUrls: urls(report), afterOfficialUrls: urls(gated), summary: gated.importanceSummary,
    familyOpportunities: Object.fromEntries(['PC', 'PlayStation', 'Xbox', 'Nintendo'].map(family => [family, { before: grouped.filter(row => leadPlatformFamilies(row).includes(family)).length, after: gated.admittedCandidates.filter(row => leadPlatformFamilies(row).includes(family)).length }])),
    decisions: gated.allCandidates.map(row => ({ title: row.title, inBaseline: !!row.inBaseline, ...row.importance })),
    sourceFailuresOrUnknown: report.coverage.filter(row => row.sourceStatus !== 'success' || row.parserStatus !== 'success').map(row => row.sourceId),
  });
}
console.log(JSON.stringify({ mode: 'offline', fetched: false, caveat: 'Saved historical discovery is incomplete and sometimes capped. Grouped using current registry; interest uses only earlier-dated editions from the current archive, not an immutable historical archive snapshot. Counts are task/URL opportunities, not quality or recall measurements. No release facts are verified by this replay.', results }, null, 2));
