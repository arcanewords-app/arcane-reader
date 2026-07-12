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

import { chaptersApi } from './chapters.js';

describe('chaptersApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getChapter calls fetchJsonDeduped with chapter path', async () => {
    const chapter = { id: 'ch-1', number: 1, title: 'Chapter 1' };
    mockFetchJsonDeduped.mockResolvedValue(chapter);

    const result = await chaptersApi.getChapter('proj-1', 'ch-1');
    assert.deepEqual(result, chapter);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/projects/proj-1/chapters/ch-1');
  });

  it('deleteChapter calls fetchJson with DELETE', async () => {
    mockFetchJson.mockResolvedValue({ success: true });

    const result = await chaptersApi.deleteChapter('proj-1', 'ch-1');
    assert.deepEqual(result, { success: true });
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/projects/proj-1/chapters/ch-1');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.method, 'DELETE');
  });

  it('getChapterStatus calls fetchJsonDeduped with status path', async () => {
    mockFetchJsonDeduped.mockResolvedValue({ status: 'translated' });

    const result = await chaptersApi.getChapterStatus('proj-1', 'ch-1');
    assert.deepEqual(result, { status: 'translated' });
    assert.equal(
      mockFetchJsonDeduped.mock.calls[0]?.[0],
      '/api/projects/proj-1/chapters/ch-1/status'
    );
  });
});
