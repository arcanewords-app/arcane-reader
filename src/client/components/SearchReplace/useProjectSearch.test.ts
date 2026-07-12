import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseChapterBound } from './useProjectSearch.js';

describe('useProjectSearch helpers', () => {
  it('parseChapterBound parses positive integers', () => {
    assert.equal(parseChapterBound('5'), 5);
    assert.equal(parseChapterBound(''), undefined);
    assert.equal(parseChapterBound('abc'), undefined);
  });
});
