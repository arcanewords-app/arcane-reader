import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { ApiError } from '../errors.js';
import { resetInFlightRequests } from '../transport/fetchDeduped.js';

const { mockFetchJson, mockFetchJsonDeduped, mockFetchFormData } = vi.hoisted(() => ({
  mockFetchJson: vi.fn(),
  mockFetchJsonDeduped: vi.fn(),
  mockFetchFormData: vi.fn(),
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

vi.mock('../cache/localStorageCache.js', () => ({
  clearCatalogLocalCache: vi.fn(),
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

import { projectsApi } from './projects.js';

describe('projectsApi', () => {
  beforeEach(() => {
    resetInFlightRequests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetInFlightRequests();
  });

  it('getProjects calls fetch with projects endpoint', async () => {
    const items = [{ id: 'proj-1', name: 'Novel' }];
    mockFetchJsonDeduped.mockResolvedValue(items);

    const result = await projectsApi.getProjects();
    assert.deepEqual(result, items);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/projects');
  });

  it('getProjects propagates ApiError from fetch', async () => {
    mockFetchJsonDeduped.mockRejectedValue(
      new ApiError('Service unavailable', 503, {}, 'SERVICE_DOWN')
    );
    await assert.rejects(
      () => projectsApi.getProjects(),
      (err: unknown) => {
        assert.equal((err as ApiError).status, 503);
        assert.equal((err as ApiError).code, 'SERVICE_DOWN');
        return true;
      }
    );
  });

  it('getProject calls fetch with project id path', async () => {
    const project = { id: 'proj-1', name: 'Novel', chapters: [] };
    mockFetchJsonDeduped.mockResolvedValue(project);

    const result = await projectsApi.getProject('proj-1');
    assert.deepEqual(result, project);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/projects/proj-1');
  });

  it('getProject propagates not-found ApiError', async () => {
    mockFetchJsonDeduped.mockRejectedValue(new ApiError('Not found', 404, {}, 'NOT_FOUND'));
    await assert.rejects(() => projectsApi.getProject('missing'), /Not found/);
  });

  it('createProject posts name and language pair', async () => {
    const created = { id: 'proj-2', name: 'New' };
    mockFetchJson.mockResolvedValue(created);

    const result = await projectsApi.createProject('New', {
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    assert.deepEqual(result, created);
    const [url, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.equal(url, '/api/projects');
    assert.equal(init.method, 'POST');
    assert.equal(
      init.body,
      JSON.stringify({
        name: 'New',
        sourceLanguage: 'en',
        targetLanguage: 'ru',
        catalogTranslationRequestId: undefined,
        translatorEntityId: undefined,
      })
    );
  });

  it('createProject propagates validation ApiError', async () => {
    mockFetchJson.mockRejectedValue(new ApiError('Validation failed', 400, { details: {} }));
    await assert.rejects(() => projectsApi.createProject(''), /Validation failed/);
  });

  it('searchProject builds query params', async () => {
    mockFetchJson.mockResolvedValue({ matches: [], total: 0, hasMore: false });

    await projectsApi.searchProject('proj-1', 'hero', {
      field: 'original',
      caseSensitive: true,
      limit: 10,
      offset: 5,
    });

    const [url] = mockFetchJson.mock.calls[0] as [string];
    assert.ok(url.startsWith('/api/projects/proj-1/search?'));
    assert.ok(url.includes('q=hero'));
    assert.ok(url.includes('field=original'));
    assert.ok(url.includes('caseSensitive=true'));
    assert.ok(url.includes('limit=10'));
    assert.ok(url.includes('offset=5'));
  });

  it('deleteProject calls DELETE', async () => {
    mockFetchJson.mockResolvedValue({ success: true });

    const result = await projectsApi.deleteProject('proj-1');
    assert.deepEqual(result, { success: true });
    const [url, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.equal(url, '/api/projects/proj-1');
    assert.equal(init.method, 'DELETE');
  });

  it('renameProject sends PATCH with name', async () => {
    mockFetchJson.mockResolvedValue({ id: 'proj-1', name: 'Renamed' });
    const result = await projectsApi.renameProject('proj-1', 'Renamed');
    assert.equal(result.name, 'Renamed');
    const [, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.equal(init.method, 'PATCH');
    assert.equal(init.body, JSON.stringify({ name: 'Renamed' }));
  });

  it('getProjectPublication returns null when API returns null', async () => {
    mockFetchJson.mockResolvedValue(null);
    const result = await projectsApi.getProjectPublication('proj-1');
    assert.equal(result, null);
  });

  it('publishProject clears catalog cache after success', async () => {
    const { clearCatalogLocalCache } = await import('../cache/localStorageCache.js');
    mockFetchJson.mockResolvedValue({ id: 'pub-1', status: 'draft' });
    await projectsApi.publishProject('proj-1', { status: 'draft' });
    assert.equal(vi.mocked(clearCatalogLocalCache).mock.calls.length, 1);
  });

  it('searchProject includes optional wholeWord and chapter range params', async () => {
    mockFetchJson.mockResolvedValue({ matches: [], total: 0, hasMore: false });
    await projectsApi.searchProject('proj-1', 'term', {
      wholeWord: true,
      chapterFrom: 1,
      chapterTo: 5,
      chapterIds: 'ch-1,ch-2',
    });
    const url = mockFetchJson.mock.calls[0]?.[0] as string;
    assert.ok(url.includes('wholeWord=true'));
    assert.ok(url.includes('chapterFrom=1'));
    assert.ok(url.includes('chapterTo=5'));
    assert.ok(url.includes('chapterIds=ch-1'));
  });

  it('cloneProject posts optional name', async () => {
    mockFetchJson.mockResolvedValue({ id: 'proj-clone' });
    await projectsApi.cloneProject('proj-1', { name: 'Copy' });
    const [, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.equal(init.method, 'POST');
    assert.equal(init.body, JSON.stringify({ name: 'Copy' }));
  });

  it('updateProjectLanguages sends PUT body', async () => {
    mockFetchJson.mockResolvedValue({ sourceLanguage: 'en', targetLanguage: 'ru' });
    const result = await projectsApi.updateProjectLanguages('proj-1', 'en', 'ru');
    assert.deepEqual(result, { sourceLanguage: 'en', targetLanguage: 'ru' });
    const [url, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.equal(url, '/api/projects/proj-1/languages');
    assert.equal(init.method, 'PUT');
  });

  it('getChaptersSummary calls deduped summary endpoint', async () => {
    mockFetchJsonDeduped.mockResolvedValue([]);
    await projectsApi.getChaptersSummary('proj-1');
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/projects/proj-1/chapters/summary');
  });

  it('exportProject posts format and author', async () => {
    mockFetchJson.mockResolvedValue({
      success: true,
      format: 'epub',
      filename: 'book.epub',
      url: '/exports/book.epub',
      path: 'book.epub',
    });
    const result = await projectsApi.exportProject('proj-1', 'epub', 'Author Name');
    assert.equal(result.format, 'epub');
    const [, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.deepEqual(JSON.parse(init.body as string), { format: 'epub', author: 'Author Name' });
  });

  it('bulkUpdateParagraphs posts updates array', async () => {
    mockFetchJson.mockResolvedValue({ succeeded: ['p-1'], failed: [] });
    const result = await projectsApi.bulkUpdateParagraphs('proj-1', [
      { chapterId: 'ch-1', paragraphId: 'p-1', translatedText: 'New text' },
    ]);
    assert.deepEqual(result.succeeded, ['p-1']);
    const [, init] = mockFetchJson.mock.calls[0] as [string, RequestInit];
    assert.equal(init.method, 'POST');
  });
});
