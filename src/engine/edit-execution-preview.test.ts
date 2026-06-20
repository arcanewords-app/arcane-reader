import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildEditExecutionPreview } from './edit-execution-preview.js';

function repeatChar(char: string, count: number): string {
  return char.repeat(count);
}

function repeatParagraphs(char: string, paragraphs: number, charsPerParagraph: number): string {
  return Array.from({ length: paragraphs }, () => char.repeat(charsPerParagraph)).join('\n\n');
}

describe('buildEditExecutionPreview', () => {
  it('one_shot + 5k chars → single_shot for all three models', () => {
    for (const modelId of ['gpt-4.1-mini', 'gpt-5.4-mini', 'o4-mini'] as const) {
      const preview = buildEditExecutionPreview({
        executionMode: 'one_shot',
        modelId,
        translatedText: repeatChar('a', 5000),
      });
      assert.equal(preview.chunkingMode, 'single_shot', modelId);
      assert.equal(preview.estimatedChunks, 1, modelId);
    }
  });

  it('chunked mode chunks long draft', () => {
    const preview = buildEditExecutionPreview({
      executionMode: 'chunked',
      modelId: 'gpt-4.1-mini',
      translatedText: repeatParagraphs('中', 10, 500),
    });
    assert.equal(preview.chunkingMode, 'chunked');
    assert.ok(preview.estimatedChunks > 1);
  });

  it('chunked short draft → single_shot direct', () => {
    const preview = buildEditExecutionPreview({
      executionMode: 'chunked',
      modelId: 'gpt-4.1-mini',
      translatedText: repeatChar('a', 2000),
    });
    assert.equal(preview.chunkingMode, 'single_shot');
    assert.equal(preview.chunkingReason, 'short_draft_direct');
  });

  it('forceChunked overrides one_shot single', () => {
    const preview = buildEditExecutionPreview({
      executionMode: 'one_shot',
      modelId: 'gpt-5.4-mini',
      translatedText: repeatChar('a', 5000),
      forceChunked: true,
    });
    assert.equal(preview.chunkingMode, 'chunked');
    assert.ok(preview.estimatedChunks >= 1);
  });

  it('chunked empty draft → zero estimated chunks', () => {
    const preview = buildEditExecutionPreview({
      executionMode: 'chunked',
      modelId: 'gpt-4.1-mini',
      translatedText: '',
    });
    assert.equal(preview.estimatedChunks, 0);
  });
});
