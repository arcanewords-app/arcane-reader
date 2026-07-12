import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFetchJson } = vi.hoisted(() => ({
  mockFetchJson: vi.fn(),
}));

vi.mock('../transport/fetchJson.js', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

import { catalogApi } from './catalog.js';

describe('catalogApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getUserTranslationRequests calls fetchJson with user endpoint', async () => {
    const requests = [{ id: 'req-1', title: 'Novel request' }];
    mockFetchJson.mockResolvedValue(requests);

    const result = await catalogApi.getUserTranslationRequests();
    assert.deepEqual(result, requests);
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/user/translation-requests');
  });

  it('createCatalogTranslationRequest calls fetchJson with POST body', async () => {
    const payload = { title: 'New novel', targetLanguage: 'ru' };
    const created = { id: 'req-2', ...payload };
    mockFetchJson.mockResolvedValue(created);

    const result = await catalogApi.createCatalogTranslationRequest(payload);
    assert.deepEqual(result, created);
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/catalog/translation-requests');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.method, 'POST');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.body, JSON.stringify(payload));
  });

  it('getTranslationRequestsBoard builds query string from params', async () => {
    mockFetchJson.mockResolvedValue([]);

    await catalogApi.getTranslationRequestsBoard({
      status: 'open',
      search: 'fantasy',
      mine: true,
      limit: 10,
      offset: 5,
    });

    const url = mockFetchJson.mock.calls[0]?.[0] as string;
    assert.ok(url.startsWith('/api/translation-requests/board?'));
    assert.ok(url.includes('status=open'));
    assert.ok(url.includes('search=fantasy'));
    assert.ok(url.includes('mine=true'));
    assert.ok(url.includes('limit=10'));
    assert.ok(url.includes('offset=5'));
  });
});
