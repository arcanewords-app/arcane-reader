/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/preact';

const mockGetReadingHistory = vi.fn();
const mockGetToken = vi.fn(() => 'test-token');

vi.mock('../api/client.js', () => ({
  api: {
    getReadingHistory: (...args: unknown[]) => mockGetReadingHistory(...args),
  },
}));

vi.mock('../services/authService.js', () => ({
  AUTH_CHANGED_EVENT: 'arcane:auth-changed',
  authService: {
    getToken: (...args: unknown[]) => mockGetToken(...args),
  },
}));

vi.mock('../api/cache/invalidation.js', () => ({
  subscribeToUserCacheInvalidation: () => () => {},
}));

import { useReadingHistory } from './useReadingHistory.js';

describe('useReadingHistory', () => {
  beforeEach(() => {
    mockGetToken.mockReturnValue('test-token');
    mockGetReadingHistory.mockReset();
    mockGetReadingHistory.mockResolvedValue({
      items: [
        {
          publicationId: 'pub-1',
          title: 'Book',
          coverImageUrl: null,
          slug: 'book',
          totalChapters: 10,
          readCount: 2,
          lastReadChapterNumber: 2,
          continueChapterId: 'ch-3',
          lastReadAt: '2026-08-01T12:00:00Z',
        },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('loads reading history on mount', async () => {
    const { result } = renderHook(() => useReadingHistory());

    await waitFor(() => assert.equal(result.current.loading, false));
    assert.equal(result.current.items.length, 1);
    assert.equal(result.current.items[0]?.publicationId, 'pub-1');
    assert.equal(result.current.readingHistoryMap['pub-1']?.lastReadChapterNumber, 2);
    assert.equal(mockGetReadingHistory.mock.calls.length, 1);
  });

  it('reload refetches reading history and rebuilds map', async () => {
    const { result } = renderHook(() => useReadingHistory());
    await waitFor(() => assert.equal(result.current.loading, false));

    mockGetReadingHistory.mockResolvedValue({
      items: [
        {
          publicationId: 'pub-2',
          title: 'Other',
          coverImageUrl: null,
          slug: 'other',
          totalChapters: 3,
          readCount: 1,
          lastReadChapterNumber: 1,
          continueChapterId: null,
          lastReadAt: null,
        },
      ],
    });
    await result.current.reload();
    await waitFor(() => assert.equal(result.current.items[0]?.publicationId, 'pub-2'));
    assert.equal(result.current.readingHistoryMap['pub-2']?.lastReadChapterNumber, 1);
    assert.equal(result.current.readingHistoryMap['pub-1'], undefined);
    assert.ok(mockGetReadingHistory.mock.calls.length >= 2);
  });

  it('clears items when API fails', async () => {
    mockGetReadingHistory.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useReadingHistory());
    await waitFor(() => assert.equal(result.current.loading, false));
    assert.equal(result.current.items.length, 0);
  });

  it('skips fetch when there is no auth token', async () => {
    mockGetToken.mockReturnValue(null);
    const { result } = renderHook(() => useReadingHistory());
    await waitFor(() => assert.equal(result.current.loading, false));
    assert.equal(result.current.items.length, 0);
    assert.equal(mockGetReadingHistory.mock.calls.length, 0);
  });

  it('loads empty list without error', async () => {
    mockGetReadingHistory.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useReadingHistory());
    await waitFor(() => assert.equal(result.current.loading, false));
    assert.equal(result.current.items.length, 0);
    assert.deepEqual(result.current.readingHistoryMap, {});
  });
});
