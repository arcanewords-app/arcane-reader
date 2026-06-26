import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveChapterSourceTextLength,
  resolveChapterSourceTextLengthFromOptions,
  resolveChapterSummarySourceTextLength,
} from './chapterSourceText.js';

describe('resolveChapterSourceTextLength', () => {
  it('full scope uses originalText when set', () => {
    const len = resolveChapterSourceTextLength(
      { originalText: 'hello world', paragraphs: [{ id: '1', originalText: 'x'.repeat(100) }] },
      'full'
    );
    assert.equal(len, 11);
  });

  it('full scope falls back to paragraphs when originalText empty', () => {
    const len = resolveChapterSourceTextLength(
      {
        originalText: '',
        paragraphs: [
          { id: '1', originalText: 'abc' },
          { id: '2', originalText: 'defgh' },
        ],
      },
      'full'
    );
    assert.equal(len, 8);
  });

  it('empty scope counts only paragraphs without valid translation', () => {
    const len = resolveChapterSourceTextLength(
      {
        paragraphs: [
          { id: '1', originalText: 'aaa', translatedText: 'translated' },
          { id: '2', originalText: 'bb', translatedText: '' },
          { id: '3', originalText: 'c', translatedText: '❌ err' },
        ],
      },
      'empty'
    );
    assert.equal(len, 3);
  });

  it('selected scope sums chosen paragraph ids', () => {
    const len = resolveChapterSourceTextLength(
      {
        paragraphs: [
          { id: 'a', originalText: '111' },
          { id: 'b', originalText: '2222' },
        ],
      },
      'selected',
      ['b']
    );
    assert.equal(len, 4);
  });
});

describe('resolveChapterSourceTextLengthFromOptions', () => {
  it('maps paragraphIds and translateOnlyEmpty', () => {
    const chapter = {
      paragraphs: [
        { id: '1', originalText: 'aa', translatedText: 'x' },
        { id: '2', originalText: 'bbb' },
      ],
    };
    assert.equal(resolveChapterSourceTextLengthFromOptions(chapter, { paragraphIds: ['2'] }), 3);
    assert.equal(
      resolveChapterSourceTextLengthFromOptions(chapter, { translateOnlyEmpty: true }),
      3
    );
  });
});

describe('resolveChapterSummarySourceTextLength', () => {
  it('uses paragraphCount heuristic when no text', () => {
    assert.equal(resolveChapterSummarySourceTextLength({ paragraphCount: 10 }), 1500);
  });
});
