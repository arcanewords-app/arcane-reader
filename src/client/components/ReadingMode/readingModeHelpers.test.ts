import { describe, expect, it } from 'vitest';
import { isSameChapterId, resolveChapterIndexById } from './readingModeHelpers.js';

describe('resolveChapterIndexById', () => {
  const chapters = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('returns index of matching chapter', () => {
    expect(resolveChapterIndexById(chapters, 'b')).toBe(1);
  });

  it('returns 0 when chapterId is missing', () => {
    expect(resolveChapterIndexById(chapters, undefined)).toBe(0);
  });

  it('returns 0 when chapterId is not found', () => {
    expect(resolveChapterIndexById(chapters, 'missing')).toBe(0);
  });

  it('returns 0 for empty list', () => {
    expect(resolveChapterIndexById([], 'a')).toBe(0);
  });
});

describe('isSameChapterId', () => {
  it('is true when both ids match', () => {
    expect(isSameChapterId('ch-1', 'ch-1')).toBe(true);
  });

  it('is false when either id is missing', () => {
    expect(isSameChapterId(undefined, 'ch-1')).toBe(false);
    expect(isSameChapterId('ch-1', undefined)).toBe(false);
  });
});
