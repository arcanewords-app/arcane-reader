import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { TextChunk } from '../types/common.js';
import { getLeadingParagraphsForChunk, splitSourceParagraphs } from './leading-context.js';

describe('leading-context', () => {
  it('splitSourceParagraphs splits on blank lines', () => {
    assert.deepEqual(splitSourceParagraphs('A\n\nB\n\nC'), ['A', 'B', 'C']);
  });

  it('getLeadingParagraphsForChunk returns paragraphs before chunk start index', () => {
    const paragraphs = ['p0', 'p1', 'p2', 'p3'];
    const chunk: TextChunk = {
      id: 'chunk-1',
      content: 'p2 text',
      startParagraphIndex: 2,
      endParagraphIndex: 2,
      index: 0,
    };
    assert.deepEqual(getLeadingParagraphsForChunk(paragraphs, chunk, 2), ['p0', 'p1']);
  });

  it('returns empty when count is zero', () => {
    const chunk: TextChunk = { id: 'chunk-1', content: 'x', index: 0 };
    assert.deepEqual(getLeadingParagraphsForChunk(['a'], chunk, 0), []);
  });
});
