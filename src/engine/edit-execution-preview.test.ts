import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildEditExecutionPreview } from './edit-execution-preview.js';

function repeatChar(char: string, count: number): string {
  return char.repeat(count);
}

const MODELS = ['gpt-4.1-mini', 'gpt-5.4-mini', 'o4-mini'] as const;

describe('buildEditExecutionPreview', () => {
  it('enhanced + 5k chars → single_shot for all three models', () => {
    const draft = repeatChar('a', 5000);
    for (const modelId of MODELS) {
      const preview = buildEditExecutionPreview({
        preset: 'enhanced',
        modelId,
        translatedText: draft,
      });
      assert.ok(preview);
      assert.equal(preview.chunkingMode, 'single_shot', modelId);
      assert.equal(preview.estimatedChunks, 1, modelId);
    }
  });

  it('fast always chunked', () => {
    const preview = buildEditExecutionPreview({
      preset: 'fast',
      modelId: 'gpt-4.1-mini',
      translatedText: repeatChar('a', 2000),
    });
    assert.ok(preview);
    assert.equal(preview.chunkingMode, 'chunked');
    assert.equal(preview.effectiveChunkSize, 1200);
    assert.ok(preview.estimatedChunks >= 1);
  });

  it('standard short draft → single_shot direct', () => {
    const preview = buildEditExecutionPreview({
      preset: 'standard',
      modelId: 'gpt-4.1-mini',
      translatedText: repeatChar('a', 2000),
    });
    assert.ok(preview);
    assert.equal(preview.chunkingMode, 'single_shot');
    assert.equal(preview.chunkingReason, 'short_draft_direct');
  });

  it('forceChunked overrides enhanced single_shot', () => {
    const preview = buildEditExecutionPreview({
      preset: 'enhanced',
      modelId: 'gpt-5.4-mini',
      translatedText: repeatChar('a', 12_000),
      forceChunked: true,
    });
    assert.ok(preview);
    assert.equal(preview.chunkingMode, 'chunked');
    assert.ok(preview.estimatedChunks > 1);
  });

  it('returns config-only preview for empty draft', () => {
    const preview = buildEditExecutionPreview({
      preset: 'standard',
      modelId: 'gpt-4.1-mini',
      translatedText: '',
    });
    assert.equal(preview.hasDraftText, false);
    assert.equal(preview.preset, 'standard');
    assert.equal(preview.editingStylePreset, 'default');
    assert.equal(preview.editingFocus, 'polish');
    assert.equal(preview.chunkingMode, 'single_shot');
    assert.equal(preview.estimatedChunks, 1);
    assert.ok(preview.hints.some((h) => h.includes('Add draft text')));
  });

  it('fast empty draft → chunked with zero estimated chunks', () => {
    const preview = buildEditExecutionPreview({
      preset: 'fast',
      modelId: 'gpt-4.1-mini',
      translatedText: '',
    });
    assert.equal(preview.hasDraftText, false);
    assert.equal(preview.chunkingMode, 'chunked');
    assert.equal(preview.estimatedChunks, 0);
  });
});
