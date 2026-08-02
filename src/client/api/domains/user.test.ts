import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { resetInFlightRequests } from '../transport/fetchDeduped.js';
import { userScopedCache } from '../cache/memoryCache.js';

vi.mock('../../services/authService.js', () => ({
  authService: {
    getToken: () => 'test-token',
    getCachedUser: () => ({ id: 'u1' }),
    refresh: vi.fn(async () => false),
    clearStorage: vi.fn(),
  },
  isReadingRoute: () => false,
  openAuthModal: vi.fn(),
}));

vi.mock('../cache/invalidation.js', () => ({
  emitCacheInvalidation: vi.fn(),
}));

import { userApi } from './user.js';

function stubFetchJson(data: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => (status === 204 ? '' : JSON.stringify(data)),
      json: async () => data,
    } as Response)
  );
}

describe('userApi', () => {
  beforeEach(() => {
    resetInFlightRequests();
    userScopedCache.readerSettings.clear();
    userScopedCache.readingHistory.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetInFlightRequests();
  });

  it('getProfile calls fetch with profile endpoint', async () => {
    const profile = { id: 'u1', email: 'a@b.com', role: 'author', avatarUrl: null };
    stubFetchJson(profile);

    const result = await userApi.getProfile();
    assert.deepEqual(result, profile);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    assert.equal(url, '/api/user/profile');
  });

  it('getTokenUsage calls fetch with default endpoint', async () => {
    const usage = { tokensUsed: 100, tokensLimit: 50000, tokensRemaining: 49900 };
    stubFetchJson(usage);

    const result = await userApi.getTokenUsage();
    assert.deepEqual(result, usage);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    assert.equal(url, '/api/user/token-usage');
  });

  it('getTokenUsage passes date query when provided', async () => {
    stubFetchJson({});

    await userApi.getTokenUsage('2026-07-12');
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    assert.equal(url, '/api/user/token-usage?date=2026-07-12');
  });

  it('getTokenUsageHistory calls fetch with days query', async () => {
    const history = { days: [{ date: '2026-07-12', tokensUsed: 100 }] };
    stubFetchJson(history);

    const result = await userApi.getTokenUsageHistory(30);
    assert.deepEqual(result, history);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    assert.equal(url, '/api/user/token-usage/history?days=30');
  });

  it('updateUserReaderSettings sends PUT and caches result', async () => {
    const settings = { fontSize: 18 };
    stubFetchJson(settings);

    const result = await userApi.updateUserReaderSettings({ fontSize: 18 });
    assert.deepEqual(result, settings);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    assert.equal(url, '/api/user/reader-settings');
    assert.equal(init.method, 'PUT');
    assert.equal(init.body, JSON.stringify({ fontSize: 18 }));
  });

  it('getReadingHistory always fetches from API without TTL cache', async () => {
    const history = {
      items: [
        {
          publicationId: 'pub-1',
          title: 'Book',
          coverImageUrl: null,
          slug: null,
          totalChapters: 5,
          readCount: 1,
          lastReadChapterNumber: 1,
          continueChapterId: 'ch-2',
          lastReadAt: null,
        },
      ],
    };
    stubFetchJson(history);

    const first = await userApi.getReadingHistory();
    const second = await userApi.getReadingHistory();
    assert.deepEqual(first, history);
    assert.deepEqual(second, history);
    assert.equal((fetch as ReturnType<typeof vi.fn>).mock.calls.length, 2);
  });

  it('reader settings cache hit avoids second network call', async () => {
    const settings = { fontSize: 16 };
    stubFetchJson(settings);
    const first = await userApi.getUserReaderSettings();
    const second = await userApi.getUserReaderSettings();
    assert.deepEqual(first, settings);
    assert.deepEqual(second, settings);
    assert.equal((fetch as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  });

  it('pseudonym and quotes helpers call expected endpoints', async () => {
    stubFetchJson([]);
    await userApi.getTranslatorPseudonyms({ includeHidden: true });
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0],
      '/api/user/translator-pseudonyms?includeHidden=1'
    );

    stubFetchJson({ id: 'pseudo-1' });
    await userApi.hideTranslatorPseudonym('pseudo-1');
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, RequestInit])[1].method,
      'POST'
    );

    stubFetchJson({ items: [] });
    await userApi.getUserQuotes();
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0],
      '/api/user/quotes'
    );

    stubFetchJson({ success: true });
    await userApi.deleteUserQuote('q1');
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, RequestInit])[0],
      '/api/user/quotes/q1'
    );

    stubFetchJson([]);
    await userApi.getUserPublications();
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0],
      '/api/user/publications'
    );
  });
});
