import { describe, expect, it } from 'vitest';
import { isDefaultCatalogRequest } from './catalogCache.js';

describe('isDefaultCatalogRequest', () => {
  it('returns true for default catalog params', () => {
    expect(isDefaultCatalogRequest()).toBe(true);
    expect(isDefaultCatalogRequest({ limit: 50, offset: 0 })).toBe(true);
  });

  it('returns false when entity filters or pagination differ', () => {
    expect(isDefaultCatalogRequest({ authorEntityId: 'a1' })).toBe(false);
    expect(isDefaultCatalogRequest({ limit: 10 })).toBe(false);
    expect(isDefaultCatalogRequest({ orderAsc: true })).toBe(false);
  });
});
