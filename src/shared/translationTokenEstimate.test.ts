import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  estimateChapterTranslationTokens,
  estimateGlossaryPromptChars,
  filterGlossaryEntriesForChapter,
  TOKENS_PER_10K_CHARS,
} from './translationTokenEstimate.js';

const entry = (overrides: {
  original: string;
  translated: string;
  mentionedInChapters?: number[];
}): { original: string; translated: string; mentionedInChapters?: number[] } => overrides;

describe('filterGlossaryEntriesForChapter', () => {
  it('includes entries with no chapter list and filters by chapter', () => {
    const glossary = [
      entry({ original: 'A', translated: 'a', mentionedInChapters: [1] }),
      entry({ original: 'B', translated: 'b', mentionedInChapters: [2] }),
      entry({ original: 'C', translated: 'c' }),
    ];
    const filtered = filterGlossaryEntriesForChapter(glossary, 1);
    assert.equal(filtered.length, 2);
    assert.ok(filtered.some((e) => e.original === 'A'));
    assert.ok(filtered.some((e) => e.original === 'C'));
  });
});

describe('estimateChapterTranslationTokens', () => {
  it('without glossary matches stage-only base formula', () => {
    const textLength = 10_000;
    const base = Math.ceil(
      (TOKENS_PER_10K_CHARS.analysis +
        TOKENS_PER_10K_CHARS.translation +
        TOKENS_PER_10K_CHARS.editing) *
        (textLength / 10000)
    );
    assert.equal(
      estimateChapterTranslationTokens({
        textLength,
        stages: 'all',
        glossary: [],
        translateChapterTitles: false,
      }),
      base
    );
  });

  it('translation-only is lower than all stages', () => {
    const textLength = 5000;
    const translationOnly = estimateChapterTranslationTokens({
      textLength,
      stages: ['translation'],
    });
    const all = estimateChapterTranslationTokens({ textLength, stages: 'all' });
    assert.ok(translationOnly < all);
  });

  it('large glossary for chapter increases estimate', () => {
    const textLength = 2000;
    const glossary = Array.from({ length: 50 }, (_, i) =>
      entry({
        original: `Name${i}`,
        translated: `Имя${i}`,
        mentionedInChapters: [3],
      })
    );
    const without = estimateChapterTranslationTokens({
      textLength,
      stages: ['translation'],
      chapterNumber: 3,
      glossary: [],
    });
    const withGlossary = estimateChapterTranslationTokens({
      textLength,
      stages: ['translation'],
      chapterNumber: 3,
      glossary,
    });
    assert.ok(withGlossary > without + 1000);
  });

  it('includeGlossaryInTranslation false skips glossary overhead', () => {
    const textLength = 2000;
    const glossary = Array.from({ length: 30 }, (_, i) =>
      entry({ original: `X${i}`, translated: `Y${i}`, mentionedInChapters: [1] })
    );
    const withGlossary = estimateChapterTranslationTokens({
      textLength,
      stages: ['translation'],
      chapterNumber: 1,
      glossary,
      settings: { includeGlossaryInTranslation: true },
    });
    const off = estimateChapterTranslationTokens({
      textLength,
      stages: ['translation'],
      chapterNumber: 1,
      glossary,
      settings: { includeGlossaryInTranslation: false },
    });
    assert.ok(off < withGlossary);
    assert.equal(
      off,
      estimateChapterTranslationTokens({
        textLength,
        stages: ['translation'],
        glossary: [],
      })
    );
  });
});

describe('estimateGlossaryPromptChars', () => {
  it('sums entry fields', () => {
    const chars = estimateGlossaryPromptChars([
      { original: 'abc', translated: 'def', declensions: { nominative: 'ghi' } },
    ]);
    assert.ok(chars >= 3 + 3 + 3 + 40);
  });
});
