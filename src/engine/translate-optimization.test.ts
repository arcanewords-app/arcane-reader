import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { resolveTranslateOptimizationFlags } from './translate-optimization.js';

describe('resolveTranslateOptimizationFlags', () => {
  it('does not enable structured CoT when only enableCoT is true', () => {
    const flags = resolveTranslateOptimizationFlags({
      enableTranslateCoT: true,
      modelId: 'gpt-4.1-mini',
    });
    assert.equal(flags.enableCoT, true);
    assert.equal(flags.enableStructuredCoT, false);
  });

  it('enables structured CoT only when explicitly requested', () => {
    const flags = resolveTranslateOptimizationFlags({
      enableTranslateCoT: true,
      enableTranslateStructuredCoT: true,
      modelId: 'gpt-4.1-mini',
    });
    assert.equal(flags.enableStructuredCoT, true);
  });

  it('keeps structured CoT off for reasoning models without explicit opt-in', () => {
    const flags = resolveTranslateOptimizationFlags({
      enableTranslateCoT: true,
      modelId: 'gpt-5.4-mini',
    });
    assert.equal(flags.enableCoT, true);
    assert.equal(flags.enableStructuredCoT, false);
  });

  it('allows explicit structured CoT on reasoning models', () => {
    const flags = resolveTranslateOptimizationFlags({
      enableTranslateCoT: true,
      enableTranslateStructuredCoT: true,
      modelId: 'gpt-5.4-mini',
    });
    assert.equal(flags.enableStructuredCoT, true);
  });
});
