import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFetchJson, mockFetchJsonDeduped } = vi.hoisted(() => ({
  mockFetchJson: vi.fn(),
  mockFetchJsonDeduped: vi.fn(),
}));

vi.mock('../transport/fetchJson.js', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

vi.mock('../transport/fetchDeduped.js', () => ({
  fetchJsonDeduped: (...args: unknown[]) => mockFetchJsonDeduped(...args),
}));

import { newsApi } from './news.js';

describe('newsApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getNewsPosts calls fetchJsonDeduped with query params', async () => {
    const posts = [{ id: 'n1', title: 'Release notes' }];
    mockFetchJsonDeduped.mockResolvedValue(posts);

    const result = await newsApi.getNewsPosts({ limit: 5, offset: 0, category: 'product' });
    assert.deepEqual(result, posts);

    const url = mockFetchJsonDeduped.mock.calls[0]?.[0] as string;
    assert.ok(url.startsWith('/api/news?'));
    assert.ok(url.includes('limit=5'));
    assert.ok(url.includes('offset=0'));
    assert.ok(url.includes('category=product'));
  });

  it('getNewsPost calls fetchJsonDeduped with encoded id or slug', async () => {
    const post = { id: 'n1', title: 'Release notes' };
    mockFetchJsonDeduped.mockResolvedValue(post);

    const result = await newsApi.getNewsPost('hello world');
    assert.deepEqual(result, post);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/news/hello%20world');
  });

  it('dismissAnnouncement calls fetchJson with POST body', async () => {
    mockFetchJson.mockResolvedValue(undefined);

    await newsApi.dismissAnnouncement('ann-1', 2);
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/announcements/ann-1/dismiss');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.method, 'POST');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.body, JSON.stringify({ contentVersion: 2 }));
  });
});
