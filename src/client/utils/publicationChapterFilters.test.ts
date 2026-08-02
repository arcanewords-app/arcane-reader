import { describe, expect, it } from 'vitest';
import { filterAndSortPublicationChapters } from './publicationChapterFilters.js';

const chapters = [
  { id: '1', number: 1, title: 'Alpha', hasTranslation: true },
  { id: '2', number: 2, title: 'Beta', hasTranslation: false },
  { id: '3', number: 3, title: 'Gamma', hasTranslation: true },
];

const base = {
  chapterSearch: '',
  showTranslationFilter: true,
  translationFilter: 'all' as const,
  chapterFilter: 'all' as const,
  chapterOrder: 'asc' as const,
  isAuthenticated: false,
  lastReadChapterNumber: 0,
};

describe('filterAndSortPublicationChapters', () => {
  it('filters by translation status when both kinds exist', () => {
    const translated = filterAndSortPublicationChapters(chapters, {
      ...base,
      translationFilter: 'translated',
    });
    expect(translated.map((c) => c.id)).toEqual(['1', '3']);

    const untranslated = filterAndSortPublicationChapters(chapters, {
      ...base,
      translationFilter: 'untranslated',
    });
    expect(untranslated.map((c) => c.id)).toEqual(['2']);
  });

  it('filters by search title and number', () => {
    expect(
      filterAndSortPublicationChapters(chapters, { ...base, chapterSearch: 'bet' }).map((c) => c.id)
    ).toEqual(['2']);
    expect(
      filterAndSortPublicationChapters(chapters, { ...base, chapterSearch: '3' }).map((c) => c.id)
    ).toEqual(['3']);
  });

  it('sorts descending when requested', () => {
    const result = filterAndSortPublicationChapters(chapters, {
      ...base,
      chapterOrder: 'desc',
    });
    expect(result.map((c) => c.number)).toEqual([3, 2, 1]);
  });

  it('applies read/unread filter for authenticated users', () => {
    const unread = filterAndSortPublicationChapters(chapters, {
      ...base,
      isAuthenticated: true,
      chapterFilter: 'unread',
      lastReadChapterNumber: 1,
    });
    expect(unread.map((c) => c.number)).toEqual([2, 3]);

    const read = filterAndSortPublicationChapters(chapters, {
      ...base,
      isAuthenticated: true,
      chapterFilter: 'read',
      lastReadChapterNumber: 1,
    });
    expect(read.map((c) => c.number)).toEqual([1]);
  });
});
