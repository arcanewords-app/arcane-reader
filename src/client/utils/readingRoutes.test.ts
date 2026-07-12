import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { getFirstAuthorReadingChapterId } from './readingRoutes.js';

describe('readingRoutes getFirstAuthorReadingChapterId', () => {
  it('picks first translated chapter in translation mode', () => {
    const chapterId = getFirstAuthorReadingChapterId({
      settings: { originalReadingMode: false },
      chapters: [
        { id: 'c1', number: 1, title: 'One', status: 'pending' },
        { id: 'c2', number: 2, title: 'Two', status: 'completed', hasTranslation: true },
      ],
    } as never);
    assert.equal(chapterId, 'c2');
  });

  it('picks first chapter by number in original reading mode', () => {
    const chapterId = getFirstAuthorReadingChapterId({
      settings: { originalReadingMode: true },
      chapters: [
        { id: 'c2', number: 2, title: 'Two' },
        { id: 'c1', number: 1, title: 'One' },
      ],
    } as never);
    assert.equal(chapterId, 'c1');
  });
});
