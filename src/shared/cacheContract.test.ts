import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  CACHE_PREFIX,
  CACHE_SCHEMA_VERSION,
  CACHE_TTL,
  cacheVersionedKey,
} from './cacheContract.js';

describe('cacheContract', () => {
  it('cacheVersionedKey prefixes schema version and joins parts', () => {
    assert.equal(cacheVersionedKey(['pub', 'list']), `${CACHE_SCHEMA_VERSION}:pub:list`);
    assert.equal(cacheVersionedKey(['user', 42, true]), `${CACHE_SCHEMA_VERSION}:user:42:true`);
  });

  it('exposes stable TTL and prefix namespaces', () => {
    assert.ok(CACHE_TTL.redisPublicationSec > 0);
    assert.ok(CACHE_TTL.clientPublicationMs > 0);
    assert.equal(CACHE_PREFIX.publication, 'pub:by-id');
    assert.equal(CACHE_PREFIX.authProfile, 'auth:profile');
  });
});
