import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_TRANSLATION_CHUNK_SIZE,
  ONE_SHOT_FALLBACK_CHUNK_SIZE,
  resolveChunkSizeTier,
  resolveTranslationChunkSize,
} from './translationChunkPresets.js';

describe('resolveTranslationChunkSize', () => {
  it('defaults to 3000 for chunked mode', () => {
    assert.equal(
      resolveTranslationChunkSize({
        executionMode: 'chunked',
        chunkingMode: 'chunked',
      }),
      DEFAULT_TRANSLATION_CHUNK_SIZE
    );
  });

  it('uses 4500 for one_shot overflow', () => {
    assert.equal(
      resolveTranslationChunkSize({
        executionMode: 'one_shot',
        chunkingMode: 'chunked',
      }),
      ONE_SHOT_FALLBACK_CHUNK_SIZE
    );
  });

  it('mini profile uses 1200', () => {
    assert.equal(
      resolveTranslationChunkSize({
        miniModelProfile: true,
        executionMode: 'chunked',
        chunkingMode: 'chunked',
      }),
      1200
    );
  });

  it('gpt-4.1-mini without profile uses 3000 not 1200', () => {
    assert.equal(
      resolveTranslationChunkSize({
        modelId: 'gpt-4.1-mini',
        executionMode: 'chunked',
        chunkingMode: 'chunked',
      }),
      3000
    );
  });

  it('override wins', () => {
    assert.equal(
      resolveTranslationChunkSize({
        override: 5000,
        executionMode: 'chunked',
        chunkingMode: 'chunked',
      }),
      5000
    );
  });
});

describe('resolveChunkSizeTier', () => {
  it('maps modes to tiers', () => {
    assert.equal(resolveChunkSizeTier('one_shot', 'single_shot'), 'single');
    assert.equal(resolveChunkSizeTier('one_shot', 'chunked'), 'large');
    assert.equal(resolveChunkSizeTier('chunked', 'chunked'), 'standard');
  });
});
