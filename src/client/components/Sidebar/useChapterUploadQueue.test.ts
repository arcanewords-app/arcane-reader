import { describe, expect, it } from 'vitest';
import { isJobBasedUploadFormat } from './chapterUploadQueueUtils.js';

describe('isJobBasedUploadFormat', () => {
  it('returns true for epub, fb2, and csv', () => {
    expect(isJobBasedUploadFormat('book.epub')).toBe(true);
    expect(isJobBasedUploadFormat('BOOK.FB2')).toBe(true);
    expect(isJobBasedUploadFormat('chapters.csv')).toBe(true);
  });

  it('returns false for txt and other extensions', () => {
    expect(isJobBasedUploadFormat('chapter.txt')).toBe(false);
    expect(isJobBasedUploadFormat('notes.md')).toBe(false);
    expect(isJobBasedUploadFormat('archive.zip')).toBe(false);
  });
});
