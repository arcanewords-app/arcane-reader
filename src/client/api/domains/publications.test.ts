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

import { publicationsApi } from './publications.js';

describe('publicationsApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getPublications calls fetchJsonDeduped with publications endpoint', async () => {
    const items = [{ id: 'pub-1', title: 'Novel' }];
    mockFetchJsonDeduped.mockResolvedValue(items);

    const result = await publicationsApi.getPublications();
    assert.deepEqual(result, items);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/publications');
  });

  it('getPublication calls fetchJsonDeduped with publication id path', async () => {
    const publication = { id: 'pub-1', title: 'Novel' };
    mockFetchJsonDeduped.mockResolvedValue(publication);

    const result = await publicationsApi.getPublication('pub-1');
    assert.deepEqual(result, publication);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/publications/pub-1');
  });

  it('reportTranslation calls fetchJson with POST body', async () => {
    mockFetchJson.mockResolvedValue({ success: true, id: 'rep-1' });

    const result = await publicationsApi.reportTranslation('pub-1', 'ch-1', 'Typo in paragraph 3');
    assert.deepEqual(result, { success: true, id: 'rep-1' });
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/publications/pub-1/report');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.method, 'POST');
    assert.equal(
      mockFetchJson.mock.calls[0]?.[1]?.body,
      JSON.stringify({ chapterId: 'ch-1', description: 'Typo in paragraph 3' })
    );
  });
});
