import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  groupParagraphRowsByChapterId,
  paragraphPageOffsets,
  type ParagraphRow,
} from './paragraphLoader.js';

describe('paragraphLoader', () => {
  it('groupParagraphRowsByChapterId groups by chapter_id', () => {
    const rows: ParagraphRow[] = [
      { chapter_id: 'a', index: 1 },
      { chapter_id: 'b', index: 0 },
      { chapter_id: 'a', index: 0 },
    ];
    const grouped = groupParagraphRowsByChapterId(rows);
    assert.equal(grouped.size, 2);
    assert.equal(grouped.get('a')?.length, 2);
    assert.equal(grouped.get('b')?.length, 1);
  });

  it('groupParagraphRowsByChapterId skips rows without chapter_id', () => {
    const grouped = groupParagraphRowsByChapterId([
      { chapter_id: 'a', index: 0 },
      { index: 1 } as ParagraphRow,
    ]);
    assert.equal(grouped.size, 1);
  });

  it('paragraphPageOffsets paginates by page size', () => {
    assert.deepEqual(paragraphPageOffsets(0, 1000), []);
    assert.deepEqual(paragraphPageOffsets(1000, 1000), [0]);
    assert.deepEqual(paragraphPageOffsets(1001, 1000), [0, 1000]);
    assert.deepEqual(paragraphPageOffsets(2500, 1000), [0, 1000, 2000]);
  });
});
