import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseChapterBound } from './useProjectSearch.js';

describe('useProjectSearch helpers', () => {
  it('parseChapterBound parses positive integers', () => {
    assert.equal(parseChapterBound('5'), 5);
    assert.equal(parseChapterBound(''), undefined);
    assert.equal(parseChapterBound('abc'), undefined);
  });

  it('parseChapterBound rejects zero, negative, and non-finite values', () => {
    assert.equal(parseChapterBound('0'), undefined);
    assert.equal(parseChapterBound('-3'), undefined);
    assert.equal(parseChapterBound('Infinity'), undefined);
    assert.equal(parseChapterBound('NaN'), undefined);
  });

  it('parseChapterBound trims whitespace before parsing', () => {
    assert.equal(parseChapterBound('  12  '), 12);
    assert.equal(parseChapterBound('\t\n'), undefined);
  });
});
