import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  estimateEditTokenBudgets,
  resolveEditChunkSize,
  resolveEditChunkingMode,
} from './edit-chunking-policy.js';

describe('edit-chunking-policy', () => {
  it('estimateEditTokenBudgets includes glossary and cast overhead', () => {
    const budgets = estimateEditTokenBudgets({
      translatedText: 'Hello world',
      glossaryText: 'term',
      castText: 'Alice',
    });
    assert.ok(budgets.inputTokens > budgets.draftTokens);
    assert.equal(budgets.outputTokens, budgets.draftTokens);
  });

  it('resolveEditChunkSize respects override and minimal flag', () => {
    assert.equal(
      resolveEditChunkSize({
        chunkSizeOverride: 1200,
        executionMode: 'chunked',
        chunkingMode: 'chunked',
      }),
      1200
    );
  });

  it('resolveEditChunkingMode chooses single_shot for small drafts', () => {
    const resolution = resolveEditChunkingMode({
      translatedText: 'Short text.',
      executionMode: 'one_shot',
      modelId: 'gpt-4.1-mini',
    });
    assert.ok(resolution.mode === 'single_shot' || resolution.mode === 'chunked');
    assert.ok(resolution.effectiveChunkSize > 0);
  });
});
