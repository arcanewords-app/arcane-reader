import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';

vi.mock('./supabaseDatabase.js', () => ({
  updateChapter: vi.fn(),
}));

vi.mock('../middleware/tokenLimits.js', () => ({
  incrementTokenUsage: vi.fn(),
}));

vi.mock('./engine-integration.js', () => ({
  resolveEffectiveLanguagePair: vi.fn(),
}));

import type { ChapterStatus } from '../storage/types.js';
import { collectTitleTranslationCandidates } from './chapterTitleTranslate.js';

describe('collectTitleTranslationCandidates', () => {
  const chapter = {
    id: 'ch-1',
    number: 1,
    title: 'Chapter 1',
    translatedTitle: '',
    status: 'completed' as ChapterStatus,
    translatedText: 'text',
  };

  it('returns empty when title translation disabled', () => {
    const result = collectTitleTranslationCandidates([chapter], {
      translateChapterTitles: false,
      translateOnlyEmpty: false,
      stages: 'all',
      succeededChapterIds: new Set(['ch-1']),
    });
    assert.deepEqual(result, []);
  });

  it('returns empty when stages exclude translation', () => {
    const result = collectTitleTranslationCandidates([chapter], {
      translateChapterTitles: true,
      translateOnlyEmpty: false,
      stages: ['analysis'],
      succeededChapterIds: new Set(['ch-1']),
    });
    assert.deepEqual(result, []);
  });

  it('collects candidate for succeeded chapter', () => {
    const result = collectTitleTranslationCandidates([chapter], {
      translateChapterTitles: true,
      translateOnlyEmpty: false,
      stages: 'all',
      succeededChapterIds: new Set(['ch-1']),
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.chapterId, 'ch-1');
  });

  it('skips chapter when translateOnlyEmpty and translated title exists', () => {
    const result = collectTitleTranslationCandidates([{ ...chapter, translatedTitle: 'Глава 1' }], {
      translateChapterTitles: true,
      translateOnlyEmpty: true,
      stages: 'all',
      succeededChapterIds: new Set(['ch-1']),
    });
    assert.deepEqual(result, []);
  });
});
