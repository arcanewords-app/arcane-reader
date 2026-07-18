import { describe, expect, it } from 'vitest';
import {
  applyMarkTranslatedChunkToProgress,
  MARK_TRANSLATED_CLIENT_CHUNK_SIZE,
  type BatchProgress,
} from './markTranslatedBatchProgress.js';

function makeProgress(overrides: Partial<BatchProgress> = {}): BatchProgress {
  return {
    mode: 'mark-translated',
    current: 0,
    total: 3,
    currentChapter: null,
    currentChapterId: null,
    chapters: [
      { chapterId: 'ch-1', title: 'One', status: 'translating' },
      { chapterId: 'ch-2', title: 'Two', status: 'translating' },
      { chapterId: 'ch-3', title: 'Three', status: 'pending' },
    ],
    totalTokens: 0,
    totalDuration: 0,
    totalGlossaryEntries: 0,
    completed: 0,
    errors: 0,
    skipped: 0,
    ...overrides,
  };
}

describe('MARK_TRANSLATED_CLIENT_CHUNK_SIZE', () => {
  it('is a positive chunk size for HTTP batching', () => {
    expect(MARK_TRANSLATED_CLIENT_CHUNK_SIZE).toBeGreaterThan(0);
    expect(MARK_TRANSLATED_CLIENT_CHUNK_SIZE).toBeLessThanOrEqual(200);
  });
});

describe('applyMarkTranslatedChunkToProgress', () => {
  it('merges chunk results and increments counters', () => {
    const prev = makeProgress();
    const next = applyMarkTranslatedChunkToProgress(prev, {
      summary: { total: 2, processed: 2, success: 1, failed: 0, skipped: 1 },
      results: [
        { chapterId: 'ch-1', status: 'success' },
        { chapterId: 'ch-2', status: 'skipped', reason: 'already translated' },
      ],
    });

    expect(next.current).toBe(2);
    expect(next.completed).toBe(1);
    expect(next.skipped).toBe(1);
    expect(next.chapters.find((c) => c.chapterId === 'ch-1')?.status).toBe('completed');
    expect(next.chapters.find((c) => c.chapterId === 'ch-2')?.status).toBe('skipped');
    expect(next.chapters.find((c) => c.chapterId === 'ch-3')?.status).toBe('pending');
  });
});
