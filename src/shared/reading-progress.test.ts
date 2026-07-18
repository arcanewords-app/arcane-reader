import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  advanceWatermarkComplete,
  countReadChapters,
  isChapterReadByWatermark,
  resolveContinueChapter,
  setWatermark,
  shouldConfirmJumpAhead,
} from './reading-progress.js';

const chapters = [
  { id: 'a', number: 1, hasTranslation: true },
  { id: 'b', number: 2, hasTranslation: true },
  { id: 'c', number: 5, hasTranslation: true },
  { id: 'd', number: 10, hasTranslation: false },
];

describe('reading-progress watermark', () => {
  it('isChapterReadByWatermark', () => {
    assert.equal(isChapterReadByWatermark(1, 0), false);
    assert.equal(isChapterReadByWatermark(1, 2), true);
    assert.equal(isChapterReadByWatermark(3, 2), false);
  });

  it('countReadChapters with gap in numbering', () => {
    assert.equal(countReadChapters(chapters, 5), 3);
    assert.equal(countReadChapters(chapters, 0), 0);
  });

  it('resolveContinueChapter', () => {
    assert.equal(resolveContinueChapter(chapters, 0)?.id, 'a');
    assert.equal(resolveContinueChapter(chapters, 1)?.id, 'b');
    assert.equal(resolveContinueChapter(chapters, 2)?.id, 'c');
    assert.equal(resolveContinueChapter(chapters, 5), null);
  });

  it('resolveContinueChapter skips untranslated', () => {
    const withUntranslated = [
      { id: 'x', number: 3, hasTranslation: false },
      { id: 'y', number: 4, hasTranslation: true },
    ];
    assert.equal(resolveContinueChapter(withUntranslated, 2)?.id, 'y');
  });

  it('shouldConfirmJumpAhead', () => {
    assert.equal(shouldConfirmJumpAhead(2, 1), false);
    assert.equal(shouldConfirmJumpAhead(3, 1), true);
    assert.equal(shouldConfirmJumpAhead(1, 0), false);
  });

  it('advanceWatermarkComplete', () => {
    assert.equal(advanceWatermarkComplete(1, 3), 3);
    assert.equal(advanceWatermarkComplete(5, 3), 5);
  });

  it('setWatermark', () => {
    assert.equal(setWatermark(7), 7);
    assert.equal(setWatermark(-1), 0);
  });
});
