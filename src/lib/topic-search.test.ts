import { expect, it } from 'vitest';
import { matchingCatchupTopicKeys } from './catchup';
import type { BriefSearchEntry } from '../types';
const entry = (titleKey: string, titleEn: string, titleZhCn?: string) => ({titleKey,titleEn,titleZhCn}) as BriefSearchEntry;
it('matches both languages, words and full-width characters without merging identities', () => {
  const entries = [entry('gta-6','Grand Theft Auto VI','GTA6'),entry('different','Grand Theft Auto VI','侠盗猎车手'),entry('company','Rockstar Games')];
  const before = structuredClone(entries);
  expect([...matchingCatchupTopicKeys(entries,'ＧＲＡＮＤ  vi')]).toEqual(['grand-theft-auto-vi','different']);
  expect([...matchingCatchupTopicKeys(entries,'侠盗')]).toEqual(['different']);
  expect([...matchingCatchupTopicKeys(entries,'GTA6')]).toEqual(['grand-theft-auto-vi']);
  expect([...matchingCatchupTopicKeys(entries,'not found')]).toEqual([]);
  expect(matchingCatchupTopicKeys(entries,'  ').size).toBe(3);
  expect(entries).toEqual(before);
});
it('retains older published names for the same reviewed topic', () => {
  expect([...matchingCatchupTopicKeys([entry('gta-6','GTA 6'),entry('grand-theft-auto-vi','Grand Theft Auto VI')],'GTA 6')]).toEqual(['grand-theft-auto-vi']);
});
