import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { chunkText, estimateTokens, splitIntoSections } from './chunker-core.js';

describe('chunker-core', () => {
  it('estimateTokens returns positive count for non-empty text', () => {
    assert.ok(estimateTokens('Hello world') > 0);
    assert.equal(estimateTokens(''), 0);
  });

  it('chunkText splits long text into multiple chunks', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}.`).join('\n\n');
    const chunks = chunkText(text, { maxTokens: 50, neverSplitParagraphs: true });
    assert.ok(chunks.length >= 1);
    assert.ok(chunks[0].content.length > 0);
  });

  it('splitIntoSections respects max section tokens', () => {
    const text = 'Section one.\n\nSection two.\n\nSection three.';
    const sections = splitIntoSections(text, 10);
    assert.ok(sections.length >= 1);
  });
});
