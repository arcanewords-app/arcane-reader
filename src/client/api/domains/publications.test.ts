import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const {
  mockFetchJson,
  mockFetchJsonDeduped,
  mockDownloadBlob,
  mockEmitCacheInvalidation,
  mockGetCachedCatalogList,
  mockSetCachedCatalogList,
  mockIsDefaultCatalogRequest,
  mockInvalidateUserReadingHistoryCache,
} = vi.hoisted(() => ({
  mockFetchJson: vi.fn(),
  mockFetchJsonDeduped: vi.fn(),
  mockDownloadBlob: vi.fn(),
  mockEmitCacheInvalidation: vi.fn(),
  mockGetCachedCatalogList: vi.fn(),
  mockSetCachedCatalogList: vi.fn(),
  mockIsDefaultCatalogRequest: vi.fn(() => false),
  mockInvalidateUserReadingHistoryCache: vi.fn(),
}));

vi.mock('../transport/fetchJson.js', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

vi.mock('../transport/fetchDeduped.js', () => ({
  fetchJsonDeduped: (...args: unknown[]) => mockFetchJsonDeduped(...args),
}));

vi.mock('../transport/downloadBlob.js', () => ({
  downloadBlob: (...args: unknown[]) => mockDownloadBlob(...args),
}));

vi.mock('../cache/invalidation.js', () => ({
  emitCacheInvalidation: (...args: unknown[]) => mockEmitCacheInvalidation(...args),
}));

vi.mock('../cache/catalogCache.js', () => ({
  getCachedCatalogList: (...args: unknown[]) => mockGetCachedCatalogList(...args),
  setCachedCatalogList: (...args: unknown[]) => mockSetCachedCatalogList(...args),
  isDefaultCatalogRequest: (...args: unknown[]) => mockIsDefaultCatalogRequest(...args),
}));

vi.mock('../cache/memoryCache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/memoryCache.js')>();
  return {
    ...actual,
    invalidateUserReadingHistoryCache: (...args: unknown[]) =>
      mockInvalidateUserReadingHistoryCache(...args),
  };
});

vi.mock('../../services/authService.js', () => ({
  authService: {
    getToken: () => 'test-token',
    getCachedUser: () => ({ id: 'u1' }),
  },
}));

import { publicationCache } from '../cache/memoryCache.js';
import { publicationsApi } from './publications.js';

describe('publicationsApi', () => {
  beforeEach(() => {
    publicationCache.withChapters.clear();
    publicationCache.glossary.clear();
    publicationCache.readProgress.clear();
    publicationCache.chapterContent.clear();
    mockIsDefaultCatalogRequest.mockReturnValue(false);
  });

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

  it('getPublications serializes filters and uses local catalog cache for default request', async () => {
    mockIsDefaultCatalogRequest.mockReturnValue(true);
    const cached = [{ id: 'cached' }];
    mockGetCachedCatalogList.mockReturnValue(cached);

    const result = await publicationsApi.getPublications({ limit: 20 });
    assert.deepEqual(result, cached);
    assert.equal(mockFetchJsonDeduped.mock.calls.length, 0);
  });

  it('getPublications caches default catalog response', async () => {
    mockIsDefaultCatalogRequest.mockReturnValue(true);
    mockGetCachedCatalogList.mockReturnValue(null);
    const items = [{ id: 'pub-1' }];
    mockFetchJsonDeduped.mockResolvedValue(items);

    const result = await publicationsApi.getPublications();
    assert.deepEqual(result, items);
    assert.equal(mockSetCachedCatalogList.mock.calls[0]?.[0], items);
  });

  it('getPublication calls fetchJsonDeduped with publication id path', async () => {
    const publication = { id: 'pub-1', title: 'Novel' };
    mockFetchJsonDeduped.mockResolvedValue(publication);

    const result = await publicationsApi.getPublication('pub-1');
    assert.deepEqual(result, publication);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/publications/pub-1');
  });

  it('getPublicationWithChapters merges payload and caches', async () => {
    mockFetchJsonDeduped.mockResolvedValue({
      publication: { id: 'pub-1', title: 'Novel' },
      chapters: [{ id: 'ch-1', number: 1, title: 'One' }],
      glossaryCount: 2,
    });

    const first = await publicationsApi.getPublicationWithChapters('pub-1');
    assert.equal(first.id, 'pub-1');
    assert.equal(first.chapters.length, 1);
    assert.equal(first.glossaryCount, 2);

    const second = await publicationsApi.getPublicationWithChapters('pub-1');
    assert.equal(mockFetchJsonDeduped.mock.calls.length, 1);
    assert.equal(second.id, 'pub-1');
  });

  it('getReadProgress and updateReadProgress invalidate caches', async () => {
    mockFetchJsonDeduped.mockResolvedValue({ lastReadChapterNumber: 2 });
    const progress = await publicationsApi.getReadProgress('pub-1');
    assert.equal(progress.lastReadChapterNumber, 2);

    mockFetchJson.mockResolvedValue({ lastReadChapterNumber: 3 });
    const updated = await publicationsApi.updateReadProgress('pub-1', 3, 'set');
    assert.equal(updated.lastReadChapterNumber, 3);
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.method, 'PATCH');
    assert.equal(mockInvalidateUserReadingHistoryCache.mock.calls.length, 1);
    assert.equal(mockEmitCacheInvalidation.mock.calls[0]?.[0], 'user');
  });

  it('resetReadProgress calls DELETE and clears history cache', async () => {
    mockFetchJson.mockResolvedValue({ lastReadChapterNumber: 0 });
    const result = await publicationsApi.resetReadProgress('pub-1');
    assert.equal(result.lastReadChapterNumber, 0);
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.method, 'DELETE');
    assert.equal(mockEmitCacheInvalidation.mock.calls[0]?.[0], 'user');
  });

  it('rating helpers call rating endpoint and invalidate catalog', async () => {
    mockFetchJsonDeduped.mockResolvedValue({ userScore: null, eligibility: 'eligible' });
    const status = await publicationsApi.getPublicationRatingStatus('pub-1');
    assert.equal(status.eligibility, 'eligible');

    mockFetchJson.mockResolvedValueOnce({ score: 5 });
    await publicationsApi.upsertPublicationRating('pub-1', 5);
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.method, 'PUT');
    assert.equal(mockEmitCacheInvalidation.mock.calls[0]?.[0], 'catalog');

    mockFetchJson.mockResolvedValueOnce({ success: true });
    await publicationsApi.deletePublicationRating('pub-1');
    assert.equal(mockFetchJson.mock.calls[1]?.[1]?.method, 'DELETE');
  });

  it('createPublicationQuote posts quote body', async () => {
    mockFetchJson.mockResolvedValue({ success: true, id: 'q1' });
    const body = {
      chapterId: 'ch-1',
      chapterNumber: 1,
      quoteText: 'Line',
      startParagraph: 0,
      startOffset: 0,
      endParagraph: 0,
      endOffset: 4,
    };
    const result = await publicationsApi.createPublicationQuote('pub-1', body);
    assert.deepEqual(result, { success: true, id: 'q1' });
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/publications/pub-1/quotes');
  });

  it('downloadPublicationExport delegates to downloadBlob', async () => {
    mockDownloadBlob.mockResolvedValue({ filename: 'book.epub' });
    const result = await publicationsApi.downloadPublicationExport('pub-1', 'epub');
    assert.deepEqual(result, { filename: 'book.epub' });
    assert.equal(
      mockDownloadBlob.mock.calls[0]?.[0],
      '/api/publications/pub-1/download?format=epub'
    );
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

  it('covers glossary/export/display/chapter content helpers', async () => {
    mockFetchJsonDeduped.mockResolvedValue([{ id: 'g1' }]);
    const glossary = await publicationsApi.getPublicationGlossary('pub-1');
    assert.equal(glossary.length, 1);
    await publicationsApi.getPublicationGlossary('pub-1');
    assert.equal(mockFetchJsonDeduped.mock.calls.length, 1);

    mockFetchJson.mockResolvedValue({ epubReady: true, fb2Ready: false });
    await publicationsApi.buildPublicationExports('pub-1', ['epub']);
    assert.equal(mockFetchJson.mock.calls.at(-1)?.[1]?.method, 'POST');

    mockFetchJson.mockResolvedValue({ success: true });
    await publicationsApi.updatePublicationDisplaySettings('pub-1', { showGlossary: true });
    assert.equal(mockFetchJson.mock.calls.at(-1)?.[1]?.method, 'PATCH');

    mockFetchJson.mockResolvedValue({ lastReadChapterNumber: 1 });
    await publicationsApi.markChapterAsRead('pub-1', 'ch-1', 1);
    assert.equal(mockFetchJson.mock.calls.at(-1)?.[1]?.method, 'PATCH');

    mockFetchJsonDeduped.mockResolvedValue({
      id: 'ch-1',
      number: 1,
      title: 'One',
      translatedText: 'text',
    });
    const chapter = await publicationsApi.getPublicationChapter('pub-1', 'ch-1');
    assert.equal(chapter.id, 'ch-1');
    await publicationsApi.getPublicationChapter('pub-1', 'ch-1');
    assert.equal(
      mockFetchJsonDeduped.mock.calls.filter((c) => String(c[0]).includes('/chapters/ch-1')).length,
      1
    );
  });
});
