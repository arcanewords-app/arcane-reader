import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { normalizeCloneChapterStatus } from './normalizeCloneChapterStatus.js';
import type { Chapter } from '../storage/database.js';

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    projectId: 'proj-1',
    number: 1,
    title: 'Chapter 1',
    status: 'pending',
    paragraphs: [],
    ...overrides,
  } as Chapter;
}

describe('normalizeCloneChapterStatus', () => {
  it('preserves stable statuses unchanged', () => {
    assert.equal(normalizeCloneChapterStatus(makeChapter({ status: 'completed' })), 'completed');
    assert.equal(normalizeCloneChapterStatus(makeChapter({ status: 'analyzed' })), 'analyzed');
    assert.equal(normalizeCloneChapterStatus(makeChapter({ status: 'pending' })), 'pending');
  });

  it('maps translating without translation to analyzed when analysis exists', () => {
    const chapter = makeChapter({
      status: 'translating',
      translationMeta: {
        tokensUsed: 0,
        duration: 0,
        model: 'test',
        translatedAt: '2026-01-01T00:00:00Z',
        lastAnalysisAt: '2026-01-01T00:00:00Z',
      },
    });
    assert.equal(normalizeCloneChapterStatus(chapter), 'analyzed');
  });

  it('maps translating without translation to pending when no analysis', () => {
    assert.equal(normalizeCloneChapterStatus(makeChapter({ status: 'translating' })), 'pending');
  });

  it('maps error with partial translation to partial', () => {
    const chapter = makeChapter({
      status: 'error',
      paragraphs: [
        {
          id: 'p1',
          index: 0,
          originalText: 'Hello',
          translatedText: 'Привет',
          status: 'translated',
        },
        { id: 'p2', index: 1, originalText: 'World', status: 'pending' },
      ],
    });
    assert.equal(normalizeCloneChapterStatus(chapter), 'partial');
  });

  it('maps error with full translation to completed', () => {
    const chapter = makeChapter({
      status: 'error',
      paragraphs: [
        {
          id: 'p1',
          index: 0,
          originalText: 'Hello',
          translatedText: 'Привет',
          status: 'translated',
        },
        { id: 'p2', index: 1, originalText: 'World', translatedText: 'Мир', status: 'translated' },
      ],
    });
    assert.equal(normalizeCloneChapterStatus(chapter), 'completed');
  });

  it('detects translation via translatedText when no paragraph model exists', () => {
    assert.equal(
      normalizeCloneChapterStatus(
        makeChapter({ status: 'translating', translatedText: '  draft  ' })
      ),
      'completed'
    );
  });

  it('detects translation via translatedChunks with partial paragraph coverage', () => {
    const chapter = makeChapter({
      status: 'error',
      translatedChunks: ['chunk'],
      paragraphs: [
        {
          id: 'p1',
          index: 0,
          originalText: 'Hello',
          translatedText: 'Привет',
          status: 'translated',
        },
        { id: 'p2', index: 1, originalText: 'World', status: 'pending' },
      ],
    });
    assert.equal(normalizeCloneChapterStatus(chapter), 'partial');
  });
});
