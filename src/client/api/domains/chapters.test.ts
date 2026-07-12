import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { ApiError } from '../errors.js';
import { resetInFlightRequests } from '../transport/fetchDeduped.js';

const { mockFetchJson, mockFetchJsonDeduped, mockFetchFormData, mockFetchFormDataWithProgress } =
  vi.hoisted(() => ({
    mockFetchJson: vi.fn(),
    mockFetchJsonDeduped: vi.fn(),
    mockFetchFormData: vi.fn(),
    mockFetchFormDataWithProgress: vi.fn(),
  }));

vi.mock('../../services/authService.js', () => ({
  authService: {
    getToken: () => 'test-token',
    refresh: vi.fn(async () => false),
    clearStorage: vi.fn(),
  },
  isReadingRoute: () => false,
  openAuthModal: vi.fn(),
}));

vi.mock('../transport/fetchJson.js', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

vi.mock('../transport/fetchDeduped.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../transport/fetchDeduped.js')>();
  return {
    ...actual,
    fetchJsonDeduped: (...args: unknown[]) => mockFetchJsonDeduped(...args),
  };
});

vi.mock('../transport/fetchFormData.js', () => ({
  fetchFormData: (...args: unknown[]) => mockFetchFormData(...args),
}));

vi.mock('../transport/fetchFormDataWithProgress.js', () => ({
  fetchFormDataWithProgress: (...args: unknown[]) => mockFetchFormDataWithProgress(...args),
}));

import { chaptersApi } from './chapters.js';

describe('chaptersApi', () => {
  beforeEach(() => {
    resetInFlightRequests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetInFlightRequests();
  });

  it('getChapter calls fetchJsonDeduped with chapter path', async () => {
    const chapter = { id: 'ch-1', number: 1, title: 'Chapter 1' };
    mockFetchJsonDeduped.mockResolvedValue(chapter);

    const result = await chaptersApi.getChapter('proj-1', 'ch-1');
    assert.deepEqual(result, chapter);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/projects/proj-1/chapters/ch-1');
  });

  it('getChapter propagates ApiError', async () => {
    mockFetchJsonDeduped.mockRejectedValue(new ApiError('Not found', 404));
    await assert.rejects(() => chaptersApi.getChapter('proj-1', 'missing'), /Not found/);
  });

  it('getChapterFresh bypasses dedupe with cache-bust query', async () => {
    mockFetchJson.mockResolvedValue({ id: 'ch-1' });
    await chaptersApi.getChapterFresh('proj-1', 'ch-1');
    const url = mockFetchJson.mock.calls[0]?.[0] as string;
    assert.ok(url.startsWith('/api/projects/proj-1/chapters/ch-1?_='));
  });

  it('deleteChapter calls fetch with DELETE', async () => {
    mockFetchJson.mockResolvedValue({ success: true });

    const result = await chaptersApi.deleteChapter('proj-1', 'ch-1');
    assert.deepEqual(result, { success: true });
    const [url, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.equal(url, '/api/projects/proj-1/chapters/ch-1');
    assert.equal(init.method, 'DELETE');
  });

  it('getChapterStatus calls fetch with status path', async () => {
    mockFetchJsonDeduped.mockResolvedValue({ status: 'translated' });

    const result = await chaptersApi.getChapterStatus('proj-1', 'ch-1');
    assert.deepEqual(result, { status: 'translated' });
    assert.equal(
      mockFetchJsonDeduped.mock.calls[0]?.[0],
      '/api/projects/proj-1/chapters/ch-1/status'
    );
  });

  it('bulkDeleteChapters posts chapterIds in body', async () => {
    mockFetchJson.mockResolvedValue({ deleted: 2 });

    const result = await chaptersApi.bulkDeleteChapters('proj-1', ['ch-1', 'ch-2']);
    assert.deepEqual(result, { deleted: 2 });
    const [url, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.equal(url, '/api/projects/proj-1/chapters/bulk-delete');
    assert.equal(init.method, 'POST');
    assert.equal(init.body, JSON.stringify({ chapterIds: ['ch-1', 'ch-2'] }));
  });

  it('updateChapterTitle calls PUT with title body', async () => {
    const chapter = { id: 'ch-1', title: 'Renamed' };
    mockFetchJson.mockResolvedValue(chapter);

    const result = await chaptersApi.updateChapterTitle('proj-1', 'ch-1', 'Renamed');
    assert.deepEqual(result, chapter);
    const [url, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.equal(url, '/api/projects/proj-1/chapters/ch-1/title');
    assert.equal(init.method, 'PUT');
    assert.equal(init.body, JSON.stringify({ title: 'Renamed' }));
  });

  it('uploadChapter uses fetchFormData without progress callback', async () => {
    const file = new File(['text'], 'chapter.txt', { type: 'text/plain' });
    mockFetchFormData.mockResolvedValue({ id: 'ch-new' });

    await chaptersApi.uploadChapter('proj-1', file, 'Title');
    assert.equal(mockFetchFormData.mock.calls.length, 1);
    assert.equal(mockFetchFormDataWithProgress.mock.calls.length, 0);
    const formData = mockFetchFormData.mock.calls[0]?.[1] as FormData;
    assert.equal(formData.get('title'), 'Title');
    assert.equal(formData.get('filename'), 'chapter.txt');
  });

  it('uploadChapter uses fetchFormDataWithProgress when onProgress provided', async () => {
    const file = new File(['text'], 'глава.txt', { type: 'text/plain' });
    const onProgress = vi.fn();
    mockFetchFormDataWithProgress.mockResolvedValue({ chapters: [], count: 0 });

    await chaptersApi.uploadChapter('proj-1', file, 'Title', undefined, onProgress);
    assert.equal(mockFetchFormDataWithProgress.mock.calls.length, 1);
    assert.equal(mockFetchFormData.mock.calls.length, 0);
    const options = mockFetchFormDataWithProgress.mock.calls[0]?.[2] as {
      onProgress?: (loaded: number, total: number) => void;
    };
    assert.equal(options.onProgress, onProgress);
  });

  it('startImportJob uses progress transport when callback provided', async () => {
    const file = new File(['text'], 'book.epub', { type: 'application/epub+zip' });
    mockFetchFormDataWithProgress.mockResolvedValue({ jobId: 'job-1', status: 'queued' });

    const result = await chaptersApi.startImportJob('proj-1', file, 'Book', undefined, vi.fn());
    assert.equal(result.jobId, 'job-1');
    assert.equal(
      mockFetchFormDataWithProgress.mock.calls[0]?.[0],
      '/api/projects/proj-1/chapters/import'
    );
  });

  it('translateChapter builds body from provided options', async () => {
    mockFetchJson.mockResolvedValue({ success: true });

    await chaptersApi.translateChapter('proj-1', 'ch-1', {
      translateOnlyEmpty: true,
      translateChapterTitles: false,
      paragraphIds: ['p-1'],
      stages: ['translation', 'editing'],
      languagePair: { sourceLanguage: 'en', targetLanguage: 'ru' },
    });

    const [, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.deepEqual(JSON.parse(init.body as string), {
      translateOnlyEmpty: true,
      translateChapterTitles: false,
      paragraphIds: ['p-1'],
      stages: ['translation', 'editing'],
      languagePair: { sourceLanguage: 'en', targetLanguage: 'ru' },
    });
  });

  it('translateChapter omits undefined options from body', async () => {
    mockFetchJson.mockResolvedValue({ success: true });
    await chaptersApi.translateChapter('proj-1', 'ch-1');
    const [, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.deepEqual(JSON.parse(init.body as string), {});
  });

  it('startAnalyzeBatch includes languagePair when provided', async () => {
    mockFetchJson.mockResolvedValue({ jobId: 'job-a', status: 'queued' });
    await chaptersApi.startAnalyzeBatch('proj-1', ['ch-1'], {
      languagePair: { sourceLanguage: 'ko', targetLanguage: 'ru' },
    });
    const [, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.deepEqual(JSON.parse(init.body as string), {
      chapterIds: ['ch-1'],
      languagePair: { sourceLanguage: 'ko', targetLanguage: 'ru' },
    });
    assert.equal((init.headers as Record<string, string>)?.Prefer, 'respond-async');
  });

  it('startTranslateBatch forwards translate options and language pair', async () => {
    mockFetchJson.mockResolvedValue({ jobId: 'job-t', status: 'queued' });
    await chaptersApi.startTranslateBatch('proj-1', ['ch-1'], {
      translateOnlyEmpty: true,
      translateChapterTitles: true,
      stages: ['translation'],
      languagePair: { sourceLanguage: 'en', targetLanguage: 'be' },
    });
    const [, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.deepEqual(JSON.parse(init.body as string), {
      chapterIds: ['ch-1'],
      translateOnlyEmpty: true,
      translateChapterTitles: true,
      stages: ['translation'],
      languagePair: { sourceLanguage: 'en', targetLanguage: 'be' },
    });
  });

  it('markChaptersAsTranslatedBatch defaults continueOnError to true', async () => {
    mockFetchJson.mockResolvedValue({ summary: { total: 1, success: 1, skipped: 0 } });
    await chaptersApi.markChaptersAsTranslatedBatch('proj-1', ['ch-1']);
    const [, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.deepEqual(JSON.parse(init.body as string), {
      chapterIds: ['ch-1'],
      options: { continueOnError: true },
    });
  });

  it('runChapterCritic sends force flag', async () => {
    mockFetchJson.mockResolvedValue({ report: {}, cached: false });
    await chaptersApi.runChapterCritic('proj-1', 'ch-1', { force: true });
    const [, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.equal(JSON.parse(init.body as string).force, true);
  });
});
