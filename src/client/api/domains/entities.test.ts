import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFetchJsonDeduped } = vi.hoisted(() => ({
  mockFetchJsonDeduped: vi.fn(),
}));

vi.mock('../transport/fetchDeduped.js', () => ({
  fetchJsonDeduped: (...args: unknown[]) => mockFetchJsonDeduped(...args),
}));

import { entitiesApi } from './entities.js';

describe('entitiesApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
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
});
