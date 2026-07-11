import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  canSingleShotTranslate,
  resolveTranslateChunkingMode,
} from './translate-chunking-policy.js';
import type { TranslateOptimizationFlags } from './translate-optimization.js';
import { chunkText } from './utils/chunker.js';
import { buildTranslateExecutionPreview } from './translate-execution-preview.js';
import { ONE_SHOT_FALLBACK_CHUNK_SIZE } from '../shared/translationChunkPresets.js';

const oneShotFlags: TranslateOptimizationFlags = {
  enableFewShot: true,
  enableCoT: true,
  enableStructuredCoT: false,
  leadingContextParagraphs: 2,
};

function repeatChar(char: string, count: number): string {
  return char.repeat(count);
}

function repeatParagraphs(char: string, paragraphs: number, charsPerParagraph: number): string {
  return Array.from({ length: paragraphs }, () => char.repeat(charsPerParagraph)).join('\n\n');
}

describe('resolveTranslateChunkingMode', () => {
  it('one_shot + ~5k chars → single_shot', () => {
    const sourceText = repeatChar('a', 5000);
    const resolution = resolveTranslateChunkingMode({
      sourceText,
      modelId: 'gpt-4.1-mini',
      optimization: oneShotFlags,
      executionMode: 'one_shot',
      targetLanguage: 'ru',
    });
    assert.equal(resolution.mode, 'single_shot');
    assert.equal(resolution.reason, 'one_shot_fits_budget');
  });

  it('one_shot + very long chapter → large chunks reason', () => {
    const sourceText = repeatChar('中', 20_000);
    const resolution = resolveTranslateChunkingMode({
      sourceText,
      modelId: 'gpt-4.1-mini',
      optimization: oneShotFlags,
      executionMode: 'one_shot',
      targetLanguage: 'ru',
    });
    assert.equal(resolution.mode, 'chunked');
    assert.equal(resolution.reason, 'one_shot_large_chunks');
  });

  it('chunked mode always chunked_standard', () => {
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
      executionMode: 'chunked',
      targetLanguage: 'ru',
    });
    assert.equal(resolution.mode, 'chunked');
    assert.equal(resolution.reason, 'chunked_standard');
  });

  it('3k CJK benchmark fits one_shot on gpt-5.4-mini', () => {
    const sourceText = repeatChar('中', 3000);
    const resolution = resolveTranslateChunkingMode({
      sourceText,
      modelId: 'gpt-5.4-mini',
      optimization: oneShotFlags,
      executionMode: 'one_shot',
      targetLanguage: 'ru',
    });
    assert.equal(resolution.mode, 'single_shot');
  });
});

describe('buildTranslateExecutionPreview', () => {
  it('preview chunk count matches chunkText for chunked mode', () => {
    const source = repeatParagraphs('a', 20, 400);
    const preview = buildTranslateExecutionPreview({
      executionMode: 'chunked',
      modelId: 'gpt-4.1-mini',
      sourceText: source,
      targetLanguage: 'ru',
    });
    const expected = chunkText(source, {
      maxTokens: preview.effectiveChunkSize,
      preserveParagraphs: true,
      neverSplitParagraphs: true,
    }).length;
    assert.equal(preview.estimatedChunks, expected);
    assert.equal(preview.effectiveChunkSize, 3000);
  });

  it('one_shot overflow uses large chunk size in preview', () => {
    const source = repeatParagraphs('中', 15, 500);
    const preview = buildTranslateExecutionPreview({
      executionMode: 'one_shot',
      modelId: 'gpt-4.1-mini',
      sourceText: source,
      targetLanguage: 'ru',
    });
    assert.equal(preview.chunkingMode, 'chunked');
    assert.equal(preview.effectiveChunkSize, ONE_SHOT_FALLBACK_CHUNK_SIZE);
    assert.ok(preview.estimatedChunks > 1);
  });
});

describe('canSingleShotTranslate', () => {
  it('returns true for short one_shot chapter within output budget', () => {
    assert.equal(
      canSingleShotTranslate({
        sourceText: repeatChar('x', 5024),
        modelId: 'gpt-4.1-mini',
        optimization: oneShotFlags,
        targetLanguage: 'ru',
      }),
      true
    );
  });
});
