/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest';
import { CACHE_SCHEMA_VERSION } from '../../../shared/cacheContract.js';
import {
  CATALOG_DEFAULT_LOCAL_KEY,
  clearCatalogLocalCache,
  getLocalStorageCached,
  setLocalStorageCached,
} from './localStorageCache.js';

describe('localStorageCache', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('round-trips versioned cache entries', () => {
    setLocalStorageCached('test-key', { items: [1] });
    const result = getLocalStorageCached<{ items: number[] }>('test-key', 60_000);
    expect(result).toEqual({ items: [1] });
  });

  it('rejects stale or wrong-version entries', () => {
    localStorage.setItem(
      'stale-key',
      JSON.stringify({ version: CACHE_SCHEMA_VERSION, ts: Date.now() - 120_000, data: 'old' })
    );
    expect(getLocalStorageCached('stale-key', 60_000)).toBeNull();

    localStorage.setItem(
      'bad-version',
      JSON.stringify({ version: 'v0', ts: Date.now(), data: 'x' })
    );
    expect(getLocalStorageCached('bad-version', 60_000)).toBeNull();
  });

  it('clearCatalogLocalCache removes default catalog key', () => {
    localStorage.setItem(CATALOG_DEFAULT_LOCAL_KEY, 'cached');
    clearCatalogLocalCache();
    expect(localStorage.getItem(CATALOG_DEFAULT_LOCAL_KEY)).toBeNull();
  });
});
