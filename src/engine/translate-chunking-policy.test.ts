import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canSingleShotTranslate,
  resolveTranslateChunkingMode,
} from './translate-chunking-policy.js';
import type { TranslateOptimizationFlags } from './translate-optimization.js';

const cotLeading: TranslateOptimizationFlags = {
  enableFewShot: false,
  enableCoT: true,
  enableStructuredCoT: false,
  leadingContextParagraphs: 2,
};

function repeatChar(char: string, count: number): string {
  return char.repeat(count);
}

describe('resolveTranslateChunkingMode', () => {
  it('selects single_shot for ~5k chars with CoT + leading context', () => {
    const sourceText = repeatChar('a', 5000);
    const resolution = resolveTranslateChunkingMode({
      sourceText,
      modelId: 'gpt-4.1-mini',
      optimization: cotLeading,
      targetLanguage: 'ru',
    });
    assert.equal(resolution.mode, 'single_shot');
    assert.equal(resolution.reason, 'cot_or_leading_context_fits_budget');
    assert.ok(resolution.effectiveMaxTokens >= 8192);
  });

  it('selects chunked for very long chapter with CoT + leading', () => {
    // CJK: ~1 token/char; 20k chars → output budget exceeds gpt-4.1-mini default cap
    const sourceText = repeatChar('中', 20_000);
    const resolution = resolveTranslateChunkingMode({
      sourceText,
      modelId: 'gpt-4.1-mini',
      optimization: cotLeading,
      targetLanguage: 'ru',
    });
    assert.equal(resolution.mode, 'chunked');
    assert.equal(resolution.reason, 'cot_or_leading_context_exceeds_output_budget');
  });

  it('respects forceChunked override', () => {
    const sourceText = repeatChar('a', 5000);
    const resolution = resolveTranslateChunkingMode({
      sourceText,
      modelId: 'gpt-4.1-mini',
      optimization: cotLeading,
      targetLanguage: 'ru',
      forceChunked: true,
    });
    assert.equal(resolution.mode, 'chunked');
    assert.equal(resolution.reason, 'force_chunked');
  });

  it('defaults to chunked without CoT or leading context', () => {
    const sourceText = repeatChar('a', 5000);
    const resolution = resolveTranslateChunkingMode({
      sourceText,
      modelId: 'gpt-4.1-mini',
      optimization: {
        enableFewShot: false,
        enableCoT: false,
        enableStructuredCoT: false,
        leadingContextParagraphs: 0,
      },
      targetLanguage: 'ru',
    });
    assert.equal(resolution.mode, 'chunked');
    assert.equal(resolution.reason, 'default_chunked');
  });

  it('single_shot when only leading context is enabled', () => {
    const sourceText = repeatChar('a', 4000);
    const resolution = resolveTranslateChunkingMode({
      sourceText,
      modelId: 'gpt-4.1-mini',
      optimization: {
        enableFewShot: false,
        enableCoT: false,
        enableStructuredCoT: false,
        leadingContextParagraphs: 2,
      },
      targetLanguage: 'ru',
    });
    assert.equal(resolution.mode, 'single_shot');
  });
});

describe('canSingleShotTranslate', () => {
  it('returns true for short CoT chapter within output budget', () => {
    assert.equal(
      canSingleShotTranslate({
        sourceText: repeatChar('x', 5024),
        modelId: 'gpt-4.1-mini',
        optimization: cotLeading,
        targetLanguage: 'ru',
      }),
      true
    );
  });
});
