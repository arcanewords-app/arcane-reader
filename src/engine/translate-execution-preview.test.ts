import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTranslateExecutionPreview } from './translate-execution-preview.js';

function repeatChar(char: string, count: number): string {
  return char.repeat(count);
}

const MODELS = ['gpt-4.1-mini', 'gpt-5.4-mini', 'o4-mini'] as const;

describe('buildTranslateExecutionPreview', () => {
  it('enhanced + 5k chars → single_shot for all three models', () => {
    const source = repeatChar('a', 5000);
    for (const modelId of MODELS) {
      const preview = buildTranslateExecutionPreview({
        preset: 'enhanced',
        modelId,
        sourceText: source,
        targetLanguage: 'ru',
      });
      assert.equal(preview.chunkingMode, 'single_shot', modelId);
      assert.equal(preview.estimatedChunks, 1, modelId);
    }
  });

  it('enhanced + 15k + gpt-4.1-mini → chunked', () => {
    const preview = buildTranslateExecutionPreview({
      preset: 'enhanced',
      modelId: 'gpt-4.1-mini',
      sourceText: repeatChar('a', 16_000),
      targetLanguage: 'ru',
    });
    assert.equal(preview.chunkingMode, 'chunked');
    assert.ok(preview.estimatedChunks > 1);
    assert.ok(preview.hints.some((h) => h.includes('gpt-5.4-mini')));
  });

  it('enhanced + 15k + gpt-5.4-mini → single_shot', () => {
    const preview = buildTranslateExecutionPreview({
      preset: 'enhanced',
      modelId: 'gpt-5.4-mini',
      sourceText: repeatChar('a', 15_000),
      targetLanguage: 'ru',
    });
    assert.equal(preview.chunkingMode, 'single_shot');
    assert.equal(preview.estimatedChunks, 1);
  });

  it('fast always chunked without CoT flags', () => {
    const preview = buildTranslateExecutionPreview({
      preset: 'fast',
      modelId: 'gpt-4.1-mini',
      sourceText: repeatChar('a', 5000),
      targetLanguage: 'ru',
    });
    assert.equal(preview.chunkingMode, 'chunked');
    assert.equal(preview.flags.enableCoT, false);
    assert.ok(preview.estimatedChunks >= 1);
  });

  it('forceChunked overrides enhanced single_shot', () => {
    const preview = buildTranslateExecutionPreview({
      preset: 'enhanced',
      modelId: 'gpt-5.4-mini',
      sourceText: repeatChar('a', 5000),
      targetLanguage: 'ru',
      forceChunked: true,
    });
    assert.equal(preview.chunkingMode, 'chunked');
    assert.ok(preview.estimatedChunks > 1);
  });
});
