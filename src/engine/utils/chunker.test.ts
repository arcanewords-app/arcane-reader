import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { mergeChunks } from './chunker.js';

describe('chunker mergeChunks', () => {
  it('merges chunks in index order with default separator', () => {
    const merged = mergeChunks([
      { content: 'B', index: 1 },
      { content: 'A', index: 0 },
    ]);
    assert.equal(merged, 'A\n\nB');
  });

  it('uses custom separatorAfter between chunks', () => {
    const merged = mergeChunks([
      { content: 'A', index: 0, separatorAfter: '\n---\n' },
      { content: 'B', index: 1 },
    ]);
    assert.equal(merged, 'A\n---\nB');
  });

  it('returns empty string for empty input', () => {
    assert.equal(mergeChunks([]), '');
  });
});
