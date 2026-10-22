import { describe, expect, it } from 'vitest';
import { buildCalendarFocus, calendarSnapshot } from './build-calendar-focus.mjs';
const item = { id: 'one', date: '2026-10-24', title: { title_key: 'game', title_en: 'Game' }, platforms: ['PC'] };
const edition = { id: 'latest', date: '2026-10-22', upcoming: [item], entries: [{ id: 'news', title: item.title, section: 'news', platforms: ['PC'], headline: '《Game》公布游戏玩法', summary: '游戏公开新的实机玩法演示。', sources: [{ url: 'https://example.com' }] }] };
const read = async path => {
  if (path.endsWith('manifest.json')) return { latest: 'latest', editions: [{ id: 'latest', date: edition.date, path: 'latest.json' }] };
  if (path.endsWith('latest.json')) return edition;
  if (path.endsWith('release-calendar-sources.json')) return { importance: { enabled: true, explorationCandidates: 0 }, maxCandidates: 100 };
  if (path.endsWith('title-translations.json')) return {};
  throw new Error('missing');
};
describe('build calendar focus', () => {
  it('includes latest substantive reporting and binds exact canonical identities without changing them', async () => {
    const before = JSON.stringify(edition); const result = await buildCalendarFocus({ read });
    expect(result).toEqual({ version: 1, status: 'available', editionId: 'latest', snapshot: calendarSnapshot(edition.upcoming), selectedIds: ['one'] });
    expect(JSON.stringify(edition)).toBe(before);
  });
  it('emits an unavailable artifact for unreadable history, not fake zero popularity', async () => {
    const result = await buildCalendarFocus({ read: async path => { if (path.endsWith('latest.json')) throw new Error('offline'); return read(path); } });
    expect(result.status).toBe('unavailable');
  });
  it('treats unclassified platform news as unavailable interest history', async () => {
    const result = await buildCalendarFocus({ read: async path => path.endsWith('latest.json') ? { ...edition, entries: [{ ...edition.entries[0], headline: 'Game news', summary: 'News' }] } : read(path) });
    expect(result.status).toBe('unavailable');
    expect(result.selectedIds).toEqual([]);
  });
  it('does not use prior calendar inclusion or exploration as focus evidence', async () => {
    const result = await buildCalendarFocus({ read: async path => path.endsWith('latest.json') ? { ...edition, entries: [{ ...edition.entries[0], title: { title_key: 'unrelated', title_en: 'Unrelated' }, headline: '《Unrelated》公布游戏玩法' }] } : read(path) });
    expect(result.status).toBe('available'); expect(result.selectedIds).toEqual([]);
  });
});
