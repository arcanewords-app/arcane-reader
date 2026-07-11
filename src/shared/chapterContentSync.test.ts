import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { shouldRefetchOpenChapter } from './chapterContentSync.js';

describe('shouldRefetchOpenChapter', () => {
  it('refetches when list completed but open still translating', () => {
    assert.equal(shouldRefetchOpenChapter('translating', 'completed'), true);
  });

  it('refetches when list partial but open pending', () => {
    assert.equal(shouldRefetchOpenChapter('pending', 'partial'), true);
  });

  it('skips when statuses match', () => {
    assert.equal(shouldRefetchOpenChapter('completed', 'completed'), false);
  });

  it('refetches terminal status change', () => {
    assert.equal(shouldRefetchOpenChapter('draft', 'completed'), true);
  });
});
