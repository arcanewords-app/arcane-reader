import { describe, expect, it } from 'vitest';
import { CACHE_PREFIX, CACHE_SCHEMA_VERSION } from '../../../src/shared/cacheContract.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('cacheContract shared wire constants', () => {
  it('freezes CACHE_SCHEMA_VERSION and CACHE_PREFIX keys', () => {
    const fixture = loadFixture('cache-contract-keys.json') as {
      schemaVersion: string;
      prefixes: Record<string, string>;
    };
    expect(fixture.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
    expect(fixture.prefixes).toEqual({ ...CACHE_PREFIX });
  });
});
