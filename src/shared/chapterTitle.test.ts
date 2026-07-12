import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  chapterDisplayTitle,
  chapterHasBodyTranslation,
  chapterMatchesListSearch,
  defaultChapterTitleFallback,
  isGenericChapterTitle,
  localizedDefaultChapterTitle,
  MAX_CHAPTER_TITLE_LENGTH,
  truncateChapterTitle,
} from './chapterTitle.js';

describe('chapterTitle', () => {
  it('chapterDisplayTitle prefers translated then original then fallback', () => {
    assert.equal(
      chapterDisplayTitle({ number: 3, title: 'Original', translatedTitle: ' Перевод ' }),
      'Перевод'
    );
    assert.equal(chapterDisplayTitle({ number: 3, title: 'Original' }), 'Original');
    assert.equal(chapterDisplayTitle({ number: 3, title: '' }), defaultChapterTitleFallback(3));
  });

  it('isGenericChapterTitle detects parser fallbacks', () => {
    assert.equal(isGenericChapterTitle('Глава 5'), true);
    assert.equal(isGenericChapterTitle('Chapter 12'), true);
    assert.equal(isGenericChapterTitle('Ch. 3'), true);
    assert.equal(isGenericChapterTitle('第 1 章'), true);
    assert.equal(isGenericChapterTitle('The Beginning'), false);
    assert.equal(isGenericChapterTitle(''), true);
  });

  it('localizedDefaultChapterTitle uses Russian for ru/be', () => {
    assert.equal(localizedDefaultChapterTitle(7, 'ru'), 'Глава 7');
    assert.equal(localizedDefaultChapterTitle(7, 'be'), 'Глава 7');
    assert.equal(localizedDefaultChapterTitle(7, 'en'), 'Chapter 7');
  });

  it('chapterMatchesListSearch matches number, original, translated, display', () => {
    const ch = { number: 5, title: 'Start', translatedTitle: 'Начало' };
    assert.equal(chapterMatchesListSearch(ch, ''), true);
    assert.equal(chapterMatchesListSearch(ch, '5'), true);
    assert.equal(chapterMatchesListSearch(ch, 'start'), true);
    assert.equal(chapterMatchesListSearch(ch, 'начало'), true);
    assert.equal(chapterMatchesListSearch(ch, 'missing'), false);
  });

  it('truncateChapterTitle respects max length', () => {
    const long = 'x'.repeat(MAX_CHAPTER_TITLE_LENGTH + 10);
    assert.equal(truncateChapterTitle(long).length, MAX_CHAPTER_TITLE_LENGTH);
    assert.equal(truncateChapterTitle(' short '), 'short');
  });

  it('chapterHasBodyTranslation detects completed and non-error text', () => {
    assert.equal(chapterHasBodyTranslation({ status: 'completed' }), true);
    assert.equal(chapterHasBodyTranslation({ translatedText: 'text' }), true);
    assert.equal(chapterHasBodyTranslation({ translatedText: '❌ failed' }), false);
    assert.equal(chapterHasBodyTranslation({ hasTranslation: true }), true);
  });
});
