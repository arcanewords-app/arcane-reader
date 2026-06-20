import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTranslateExecutionPreview } from './translate-execution-preview.js';

function repeatChar(char: string, count: number): string {
  return char.repeat(count);
}

function repeatParagraphs(char: string, paragraphs: number, charsPerParagraph: number): string {
  return Array.from({ length: paragraphs }, () => char.repeat(charsPerParagraph)).join('\n\n');
}

const MODELS = ['gpt-4.1-mini', 'gpt-5.4-mini', 'o4-mini'] as const;

describe('buildTranslateExecutionPreview', () => {
  it('one_shot + 5k chars → single_shot for all three models', () => {
    const source = repeatChar('a', 5000);
    for (const modelId of MODELS) {
      const preview = buildTranslateExecutionPreview({
        executionMode: 'one_shot',
        modelId,
        sourceText: source,
        targetLanguage: 'ru',
      });
      assert.equal(preview.chunkingMode, 'single_shot', modelId);
      assert.equal(preview.estimatedChunks, 1, modelId);
    }
  });

  it('one_shot + 15k + gpt-4.1-mini → large chunks', () => {
    // CJK ~1 tok/char in tiktoken; Latin repeats compress and under-count chunks.
    const preview = buildTranslateExecutionPreview({
      executionMode: 'one_shot',
      modelId: 'gpt-4.1-mini',
      sourceText: repeatParagraphs('中', 20, 600),
      targetLanguage: 'ru',
    });
    assert.equal(preview.chunkingMode, 'chunked');
    assert.equal(preview.chunkSizeTier, 'large');
    assert.ok(preview.estimatedChunks > 1);
    assert.ok(preview.hints.some((h) => h.includes('gpt-5.4-mini')));
  });

  it('one_shot + 15k + gpt-5.4-mini → single_shot', () => {
    const preview = buildTranslateExecutionPreview({
      executionMode: 'one_shot',
      modelId: 'gpt-5.4-mini',
      sourceText: repeatChar('a', 15_000),
      targetLanguage: 'ru',
    });
    assert.equal(preview.chunkingMode, 'single_shot');
    assert.equal(preview.estimatedChunks, 1);
  });

  it('chunked always chunked without CoT flags', () => {
    const preview = buildTranslateExecutionPreview({
      executionMode: 'chunked',
      modelId: 'gpt-4.1-mini',
      sourceText: repeatChar('a', 5000),
      targetLanguage: 'ru',
    });
    assert.equal(preview.chunkingMode, 'chunked');
    assert.equal(preview.flags.enableCoT, false);
    assert.ok(preview.estimatedChunks >= 1);
  });

  it('forceChunked overrides one_shot single', () => {
    const preview = buildTranslateExecutionPreview({
      executionMode: 'one_shot',
      modelId: 'gpt-5.4-mini',
      sourceText: repeatChar('a', 5000),
      targetLanguage: 'ru',
      forceChunked: true,
    });
    assert.equal(preview.chunkingMode, 'chunked');
    assert.equal(preview.estimatedChunks, 1);
  });
});
