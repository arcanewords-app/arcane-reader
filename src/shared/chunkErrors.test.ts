import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { CHUNK_ERROR_PREFIX, isChunkError } from './chunkErrors.js';

describe('chunkErrors', () => {
  it('detects chunk error prefix at start of trimmed text', () => {
    assert.equal(isChunkError(`${CHUNK_ERROR_PREFIX} timeout`), true);
    assert.equal(isChunkError(`  ${CHUNK_ERROR_PREFIX} rate limit`), true);
  });

  it('returns false for normal translation text', () => {
    assert.equal(isChunkError('Hello world'), false);
    assert.equal(isChunkError(`text with ${CHUNK_ERROR_PREFIX} inside`), false);
  });

  it('handles empty and whitespace-only input', () => {
    assert.equal(isChunkError(''), false);
    assert.equal(isChunkError('   '), false);
  });
});
