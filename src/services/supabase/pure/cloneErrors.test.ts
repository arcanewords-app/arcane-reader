import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  createCloneIncompleteError,
  createTransferIncompleteError,
  remapMentionedInChapters,
} from './cloneErrors.js';

describe('cloneErrors', () => {
  it('createCloneIncompleteError sets code and counts', () => {
    const err = createCloneIncompleteError(10, 5);
    assert.equal(err.code, 'CLONE_INCOMPLETE');
    assert.equal(err.expected, 10);
    assert.equal(err.actual, 5);
  });

  it('remapMentionedInChapters remaps chapter numbers', () => {
    const map = new Map([
      [1, 5],
      [2, 6],
    ]);
    assert.deepEqual(remapMentionedInChapters([1, 2], map), [5, 6]);
  });

  it('createTransferIncompleteError sets TRANSFER_INCOMPLETE code', () => {
    const err = createTransferIncompleteError(3, 1);
    assert.equal(err.code, 'TRANSFER_INCOMPLETE');
  });
});
