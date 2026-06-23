import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateAiReplaceTokens } from './aiReplaceEstimate.js';

describe('estimateAiReplaceTokens', () => {
  it('includes batch overhead for large paragraph counts', () => {
    const small = estimateAiReplaceTokens(3000, 5);
    const large = estimateAiReplaceTokens(3000, 45);
    assert.ok(large > small);
    assert.equal(large - small, 3000); // 2 extra batches × 1500
  });

  it('scales with character count', () => {
    const a = estimateAiReplaceTokens(3000, 10);
    const b = estimateAiReplaceTokens(6000, 10);
    assert.equal(b - a, 1000);
  });
});
