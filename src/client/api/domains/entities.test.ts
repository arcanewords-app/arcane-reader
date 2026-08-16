import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFetchJsonDeduped } = vi.hoisted(() => ({
  mockFetchJsonDeduped: vi.fn(),
}));

vi.mock('../transport/fetchDeduped.js', () => ({
  fetchJsonDeduped: (...args: unknown[]) => mockFetchJsonDeduped(...args),
}));

import { publicationCache } from '../cache/memoryCache.js';
import { entitiesApi } from './entities.js';

describe('entitiesApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
    publicationCache.publicEntity.clear();
  });

  it('getPublicEntities calls fetchJsonDeduped with query params', async () => {
    const entities = [{ id: 'e1', name: 'Author', kind: 'author' }];
    mockFetchJsonDeduped.mockResolvedValue(entities);

    const result = await entitiesApi.getPublicEntities({
      kind: 'author',
      search: 'tol',
      limit: 10,
      offset: 0,
    });
    assert.deepEqual(result, entities);

    const url = mockFetchJsonDeduped.mock.calls[0]?.[0] as string;
    assert.ok(url.startsWith('/api/public/entities?'));
    assert.ok(url.includes('kind=author'));
    assert.ok(url.includes('search=tol'));
    assert.ok(url.includes('limit=10'));
    assert.ok(url.includes('offset=0'));
  });

  it('getPublicEntityById calls fetchJsonDeduped and returns entity', async () => {
    const entity = { id: 'e1', name: 'Author', kind: 'author' };
    mockFetchJsonDeduped.mockResolvedValue(entity);

    const result = await entitiesApi.getPublicEntityById('e1');
    assert.deepEqual(result, entity);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/public/entities/e1');
  });

  it('getPublicEntityById returns null on fetch error', async () => {
    mockFetchJsonDeduped.mockRejectedValue(new Error('not found'));

    const result = await entitiesApi.getPublicEntityById('missing');
    assert.equal(result, null);
  });

  it('getPublicEntitiesByIds batches request and fills cache', async () => {
    const entities = [
      { id: 'e1', name: 'A', kind: 'author' },
      { id: 'e2', name: 'B', kind: 'translator' },
    ];
    mockFetchJsonDeduped.mockResolvedValue(entities);

    const result = await entitiesApi.getPublicEntitiesByIds(['e1', 'e2', 'e1']);
    assert.equal(result.length, 2);
    const url = mockFetchJsonDeduped.mock.calls[0]?.[0] as string;
    assert.ok(url.includes('/api/public/entities?ids='));
    assert.ok(url.includes('e1'));
    assert.ok(url.includes('e2'));

    mockFetchJsonDeduped.mockClear();
    const cached = await entitiesApi.getPublicEntityById('e1');
    assert.equal(cached?.name, 'A');
    assert.equal(mockFetchJsonDeduped.mock.calls.length, 0);
  });

  it('getPublicEntitiesByIds returns empty for empty input', async () => {
    const result = await entitiesApi.getPublicEntitiesByIds([]);
    assert.deepEqual(result, []);
    assert.equal(mockFetchJsonDeduped.mock.calls.length, 0);
  });
});
