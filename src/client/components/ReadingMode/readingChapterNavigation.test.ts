import { describe, expect, it } from 'vitest';
import type { ChapterListItem } from '../../types';
import {
  filterProjectReadingChapters,
  isValidChapterIndex,
  resolvePublicationChapters,
  shouldPromptJumpConfirm,
  shouldSkipChapterRoute,
} from './readingChapterNavigation.js';

describe('readingChapterNavigation', () => {
  it('shouldSkipChapterRoute', () => {
    expect(shouldSkipChapterRoute('/a', null)).toBe(true);
    expect(shouldSkipChapterRoute('/a', '/a')).toBe(true);
    expect(shouldSkipChapterRoute('/a', '/b')).toBe(false);
  });

  it('shouldPromptJumpConfirm only for publication jump-ahead', () => {
    expect(
      shouldPromptJumpConfirm({
        isPublicationMode: true,
        hasOnSetProgress: true,
        targetChapterNumber: 5,
        lastReadChapterNumber: 1,
      })
    ).toBe(true);
    expect(
      shouldPromptJumpConfirm({
        isPublicationMode: true,
        hasOnSetProgress: true,
        targetChapterNumber: 2,
        lastReadChapterNumber: 1,
        skipJumpConfirm: true,
      })
    ).toBe(false);
    expect(
      shouldPromptJumpConfirm({
        isPublicationMode: false,
        hasOnSetProgress: true,
        targetChapterNumber: 5,
        lastReadChapterNumber: 1,
      })
    ).toBe(false);
  });

  it('isValidChapterIndex', () => {
    expect(isValidChapterIndex(1, 3, 0)).toBe(true);
    expect(isValidChapterIndex(0, 3, 0)).toBe(false);
    expect(isValidChapterIndex(-1, 3, 0)).toBe(false);
    expect(isValidChapterIndex(3, 3, 0)).toBe(false);
  });

  it('resolvePublicationChapters copies list', () => {
    const list = [{ id: 'a', number: 1, title: 'One' }];
    expect(resolvePublicationChapters(list)).toEqual(list);
    expect(resolvePublicationChapters(list)).not.toBe(list);
  });

  it('filterProjectReadingChapters respects original mode and statuses', () => {
    const chapters = [
      { id: '1', number: 2, title: 'B', hasTranslation: false, status: 'pending' },
      { id: '2', number: 1, title: 'A', hasTranslation: true, status: 'completed' },
      { id: '3', number: 3, title: 'C', hasTranslation: false, status: 'draft' },
    ] as ChapterListItem[];

    const original = filterProjectReadingChapters(chapters, true);
    expect(original.map((c) => c.id)).toEqual(['2', '1', '3']);

    const translated = filterProjectReadingChapters(chapters, false);
    expect(translated.map((c) => c.id)).toEqual(['2', '3']);
  });
});
