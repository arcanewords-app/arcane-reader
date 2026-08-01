import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { buildReadingHistoryMap, type ReadingHistoryItem } from './useReadingHistory.js';

describe('buildReadingHistoryMap', () => {
  it('maps publication ids to progress and continue chapter', () => {
    const items: ReadingHistoryItem[] = [
      {
        publicationId: 'pub-1',
        title: 'Book A',
        coverImageUrl: null,
        slug: 'book-a',
        totalChapters: 10,
        readCount: 3,
        lastReadChapterNumber: 3,
        continueChapterId: 'ch-4',
        lastReadAt: '2026-08-01T12:00:00Z',
      },
      {
        publicationId: 'pub-2',
        title: 'Book B',
        coverImageUrl: null,
        slug: null,
        totalChapters: 5,
        readCount: 5,
        lastReadChapterNumber: 5,
        continueChapterId: null,
        lastReadAt: null,
      },
    ];

    const map = buildReadingHistoryMap(items);
    assert.deepEqual(map, {
      'pub-1': { lastReadChapterNumber: 3, continueChapterId: 'ch-4' },
      'pub-2': { lastReadChapterNumber: 5, continueChapterId: null },
    });
  });

  it('returns empty map for no items', () => {
    assert.deepEqual(buildReadingHistoryMap([]), {});
  });
});
