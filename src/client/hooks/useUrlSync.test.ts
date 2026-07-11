import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { urlSyncStateEquals } from './useUrlSync.js';

describe('urlSyncStateEquals', () => {
  it('returns true for identical primitives', () => {
    assert.equal(urlSyncStateEquals('all', 'all'), true);
    assert.equal(urlSyncStateEquals(1, 1), true);
    assert.equal(urlSyncStateEquals(null, null), true);
  });

  it('returns false for different primitives', () => {
    assert.equal(urlSyncStateEquals('all', 'mine'), false);
    assert.equal(urlSyncStateEquals(1, 2), false);
  });

  it('returns true for structurally equal objects', () => {
    assert.equal(
      urlSyncStateEquals(
        { filter: 'all', entityFilter: { author: 'a1' } },
        { filter: 'all', entityFilter: { author: 'a1' } }
      ),
      true
    );
  });

  it('returns true when undefined keys are omitted in JSON', () => {
    assert.equal(
      urlSyncStateEquals({ filter: 'all', entityFilter: {} }, { filter: 'all', entityFilter: {} }),
      true
    );
    assert.equal(
      urlSyncStateEquals(
        { filter: 'all', entityFilter: { author: undefined } },
        { filter: 'all', entityFilter: {} }
      ),
      true
    );
  });

  it('returns false for different object shapes', () => {
    assert.equal(
      urlSyncStateEquals({ filter: 'all', entityFilter: {} }, { filter: 'mine', entityFilter: {} }),
      false
    );
    assert.equal(
      urlSyncStateEquals(
        { filter: 'all', entityFilter: { author: 'a1' } },
        { filter: 'all', entityFilter: { author: 'a2' } }
      ),
      false
    );
  });

  it('returns false when one value is object and other is not', () => {
    assert.equal(urlSyncStateEquals({ filter: 'all' }, 'all'), false);
  });
});
