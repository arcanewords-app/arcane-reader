import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { pageOffsets, rangeEnd, paginateUntilShortPage } from './pagination.js';

describe('pagination helpers', () => {
  it('pageOffsets returns correct offsets', () => {
    assert.deepEqual(pageOffsets(2500, 1000), [0, 1000, 2000]);
  });

  it('rangeEnd computes inclusive end index', () => {
    assert.equal(rangeEnd(0, 50), 49);
  });

  it('paginateUntilShortPage collects all pages', async () => {
    const pages = [[1, 2], [3], []];
    let call = 0;
    const all = await paginateUntilShortPage(async () => {
      return pages[call++] ?? [];
    }, 2);
    assert.deepEqual(all, [1, 2, 3]);
  });
});
