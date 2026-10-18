import { describe, expect, it } from 'vitest';
import type { GlossaryEntry } from '../../types.js';
import { filterGlossaryEntriesByTypeAndSearch } from './glossaryFilterShared.js';

function entry(overrides: Partial<GlossaryEntry>): GlossaryEntry {
  return {
    id: 'g1',
    type: 'character',
    original: 'Sword',
    translated: 'Меч',
    ...overrides,
  };
}

describe('filterGlossaryEntriesByTypeAndSearch', () => {
  const entries = [
    entry({ id: 'g1', type: 'character', original: 'Sword', translated: 'Меч' }),
    entry({ id: 'g2', type: 'location', original: 'Castle', translated: 'Замок' }),
  ];

  it('returns every entry when the filter is all and the search is empty', () => {
    expect(filterGlossaryEntriesByTypeAndSearch(entries, 'all', '')).toEqual(entries);
    expect(filterGlossaryEntriesByTypeAndSearch(entries, 'all', '   ')).toEqual([]);
  });

  it('matches type and either original or translated text', () => {
    expect(
      filterGlossaryEntriesByTypeAndSearch(entries, 'location', '').map((item) => item.id)
    ).toEqual(['g2']);
    expect(
      filterGlossaryEntriesByTypeAndSearch(entries, 'all', 'меч').map((item) => item.id)
    ).toEqual(['g1']);
    expect(filterGlossaryEntriesByTypeAndSearch(entries, 'character', 'castle')).toEqual([]);
  });
});
