/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHE_SCHEMA_VERSION } from '../../../shared/cacheContract.js';

vi.mock('./memoryCache.js', () => ({
  clearUserScopedCaches: vi.fn(),
}));

import { clearUserScopedCaches } from './memoryCache.js';
import { CACHE_INVALIDATION_KEY, emitCacheInvalidation } from './invalidation.js';

describe('emitCacheInvalidation', () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('writes versioned payload to localStorage', () => {
    emitCacheInvalidation('user');

    const raw = localStorage.getItem(CACHE_INVALIDATION_KEY);
    expect(raw).toBeTruthy();
    const payload = JSON.parse(raw!) as { scope: string; version: string; ts: number };
    expect(payload.scope).toBe('user');
    expect(payload.version).toBe(CACHE_SCHEMA_VERSION);
    expect(typeof payload.ts).toBe('number');
  });
});

describe('invalidation listeners', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears user caches on valid storage event', () => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: CACHE_INVALIDATION_KEY,
        newValue: JSON.stringify({ scope: 'user' }),
      })
    );

    expect(clearUserScopedCaches).toHaveBeenCalled();
  });

  it('ignores storage events for other keys', () => {
    vi.mocked(clearUserScopedCaches).mockClear();

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'other-key',
        newValue: JSON.stringify({ scope: 'user' }),
      })
    );

    expect(clearUserScopedCaches).not.toHaveBeenCalled();
  });

  it('ignores invalid JSON payload', () => {
    vi.mocked(clearUserScopedCaches).mockClear();

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: CACHE_INVALIDATION_KEY,
        newValue: 'not-json',
      })
    );

    expect(clearUserScopedCaches).not.toHaveBeenCalled();
  });

  it('ignores payload with unknown scope', () => {
    vi.mocked(clearUserScopedCaches).mockClear();

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: CACHE_INVALIDATION_KEY,
        newValue: JSON.stringify({ scope: 'public' }),
      })
    );

    expect(clearUserScopedCaches).not.toHaveBeenCalled();
  });
});
