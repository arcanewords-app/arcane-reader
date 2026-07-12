import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportJobState, ImportJobStore } from '../../../services/importJobStore.js';
import type { RouteDeps } from '../deps.js';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  runAsyncImportJob: vi.fn(),
  handleServiceError: vi.fn(() => false),
  generateImportJobId: vi.fn(() => 'job-test-1'),
  toPublicImportJob: vi.fn((job: ImportJobState, _options?: { compact?: boolean }) => ({
    jobId: job.jobId,
    status: job.status,
    progress: 0,
    public: true,
    compact: _options?.compact ?? false,
  })),
  isSupportedFormat: vi.fn((filename: string) => /\.(epub|fb2|csv|txt)$/i.test(filename)),
  parseFile: vi.fn(),
  parseEpubLazy: vi.fn(),
  getProjectTypeFromFormat: vi.fn(() => 'book' as const),
  importChaptersBatch: vi.fn(),
  getChapter: vi.fn(),
  updateProject: vi.fn(),
  invalidateUserProjectCaches: vi.fn(),
}));

vi.mock('../../../services/supabaseClient.js', () => ({
  supabase: {},
  createClientWithToken: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock('../../../logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../services/supabase/domains/projects.js', () => ({
  getProject: mocks.getProject,
  updateProject: mocks.updateProject,
}));

vi.mock('../../../services/supabase/domains/chapters.js', () => ({
  importChaptersBatch: mocks.importChaptersBatch,
  getChapter: mocks.getChapter,
}));

vi.mock('../../../services/import/index.js', () => ({
  isSupportedFormat: (filename: string) => mocks.isSupportedFormat(filename),
  parseFile: mocks.parseFile,
  parseEpubLazy: mocks.parseEpubLazy,
  getProjectTypeFromFormat: mocks.getProjectTypeFromFormat,
}));

vi.mock('../../../services/storage.js', () => ({
  uploadFile: vi.fn(),
}));

vi.mock('../../routeHelpers.js', () => ({
  generateImportJobId: () => mocks.generateImportJobId(),
  toPublicImportJob: (job: ImportJobState, options?: { compact?: boolean }) =>
    mocks.toPublicImportJob(job, options),
  decodeMultipartFilename: (name: string) => name,
  IMPORT_JOB_FORMATS: new Set(['epub', 'fb2', 'csv']),
  IMPORT_JOB_TTL_SECONDS: 3600,
  IMPORT_CHAPTER_BATCH_SIZE: 20,
  invalidateUserProjectCaches: mocks.invalidateUserProjectCaches,
}));

vi.mock('../../chapters/helpers/asyncImportJob.js', () => ({
  runAsyncImportJob: mocks.runAsyncImportJob,
}));

vi.mock('../../../middleware/serviceHealth.js', () => ({
  handleServiceError: mocks.handleServiceError,
}));

const {
  createHandleStartImportJob,
  createHandleGetImportJobStatus,
  createHandleCancelImportJob,
  handleSyncChapterImport,
} = await import('./chapterImportRouteHandlers.js');

async function* epubChapterIterator(
  chapters: Array<{ title: string; content: string }>
): AsyncGenerator<{ title: string; content: string }, void, unknown> {
  for (const chapter of chapters) {
    yield chapter;
  }
}

function createInMemoryImportJobStore(initialJob?: ImportJobState): ImportJobStore {
  const jobs = new Map<string, ImportJobState>();
  const cancelFlags = new Set<string>();
  if (initialJob) {
    jobs.set(initialJob.jobId, { ...initialJob });
  }

  return {
    createJob: vi.fn(async (job) => {
      jobs.set(job.jobId, { ...job });
    }),
    getJob: vi.fn(async (jobId) => jobs.get(jobId) ?? null),
    updateJob: vi.fn(async (jobId, patch) => {
      const current = jobs.get(jobId);
      if (!current) return null;
      const next = { ...current, ...patch };
      jobs.set(jobId, next);
      return next;
    }),
    requestCancel: vi.fn(async (jobId) => {
      cancelFlags.add(jobId);
    }),
    isCancelRequested: vi.fn(async (jobId) => cancelFlags.has(jobId)),
    cancelJob: vi.fn(),
    deleteJob: vi.fn(async (jobId) => {
      jobs.delete(jobId);
    }),
    setTtl: vi.fn(),
  };
}

function baseJob(overrides: Partial<ImportJobState> = {}): ImportJobState {
  return {
    jobId: 'job-1',
    projectId: 'proj-1',
    userId: 'user-1',
    status: 'queued',
    phase: null,
    format: 'epub',
    filename: 'book.epub',
    current: 0,
    total: 0,
    warnings: [],
    errors: [],
    chapters: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelRequested: false,
    ...overrides,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', role: 'author' as const },
    token: 'bearer-token',
    params: { id: 'proj-1', jobId: 'job-1' },
    body: {},
    query: {},
    file: {
      buffer: Buffer.from('epub-content'),
      originalname: 'book.epub',
    },
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    ...overrides,
  };
}

function makeDeps(store: ImportJobStore): RouteDeps {
  return {
    config: {
      openai: { apiKey: 'test-key', model: 'gpt-test', timeout: 60000 },
    } as RouteDeps['config'],
    configValidation: { valid: true, errors: [] },
    upload: {} as RouteDeps['upload'],
    uploadGlossaryFile: {} as RouteDeps['uploadGlossaryFile'],
    uploadImage: {} as RouteDeps['uploadImage'],
    uploadAvatar: {} as RouteDeps['uploadAvatar'],
    importJobStore: store,
    analysisJobStore: {} as RouteDeps['analysisJobStore'],
    translateJobStore: {} as RouteDeps['translateJobStore'],
  };
}

describe('chapterImportRouteHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue({
      id: 'proj-1',
      chapters: [],
      metadata: {},
      type: 'text',
    });
    mocks.runAsyncImportJob.mockResolvedValue(undefined);
    mocks.handleServiceError.mockReturnValue(false);
    mocks.isSupportedFormat.mockImplementation((filename: string) =>
      /\.(epub|fb2|csv|txt)$/i.test(filename)
    );
    mocks.importChaptersBatch.mockResolvedValue([
      { sourceIndex: 0, chapterId: 'ch-1', number: 1, title: 'Ch 1', paragraphsCount: 1 },
    ]);
    mocks.getChapter.mockResolvedValue({ id: 'ch-1', title: 'Ch 1' });
    mocks.updateProject.mockResolvedValue(undefined);
    mocks.invalidateUserProjectCaches.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createHandleStartImportJob', () => {
    it('returns 202 and creates job for supported epub upload', async () => {
      vi.useFakeTimers();
      const store = createInMemoryImportJobStore();
      const handler = createHandleStartImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);
      await vi.runAllTimersAsync();

      assert.equal(res.statusCode, 202);
      assert.deepEqual(res.body, { jobId: 'job-test-1', status: 'queued' });
      expect(store.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-test-1',
          projectId: 'proj-1',
          userId: 'user-1',
          format: 'epub',
          status: 'queued',
        })
      );
      expect(store.setTtl).toHaveBeenCalledWith('job-test-1', 3600);
      expect(mocks.runAsyncImportJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-test-1',
          projectId: 'proj-1',
          userId: 'user-1',
          extension: 'epub',
        })
      );
    });

    it('returns 400 when no file uploaded', async () => {
      const store = createInMemoryImportJobStore();
      const handler = createHandleStartImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq({ file: undefined }) as never, res as never);

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'No file uploaded' });
      expect(store.createJob).not.toHaveBeenCalled();
    });

    it('returns 401 when user is missing', async () => {
      const store = createInMemoryImportJobStore();
      const handler = createHandleStartImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq({ user: undefined }) as never, res as never);

      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: 'Unauthorized' });
    });

    it('returns 400 for unsupported file format', async () => {
      mocks.isSupportedFormat.mockReturnValue(false);
      const store = createInMemoryImportJobStore();
      const handler = createHandleStartImportJob(makeDeps(store));
      const res = mockRes();

      await handler(
        mockReq({
          file: { buffer: Buffer.from('data'), originalname: 'book.docx' },
        }) as never,
        res as never
      );

      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Неподдерживаемый формат файла');
    });

    it('returns 500 when service error is not infrastructure', async () => {
      mocks.getProject.mockRejectedValue(new Error('unexpected'));
      const store = createInMemoryImportJobStore();
      const handler = createHandleStartImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.equal(res.statusCode, 500);
      assert.equal((res.body as { error: string }).error, 'Failed to start import job');
    });

    it('returns 401 when token is missing', async () => {
      const store = createInMemoryImportJobStore();
      const handler = createHandleStartImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq({ token: undefined }) as never, res as never);

      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when project not found', async () => {
      mocks.getProject.mockResolvedValue(null);
      const store = createInMemoryImportJobStore();
      const handler = createHandleStartImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Project not found' });
    });

    it('returns 400 for txt format (non job-based import)', async () => {
      const store = createInMemoryImportJobStore();
      const handler = createHandleStartImportJob(makeDeps(store));
      const res = mockRes();

      await handler(
        mockReq({
          file: { buffer: Buffer.from('text'), originalname: 'chapter.txt' },
        }) as never,
        res as never
      );

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, {
        error: 'Формат должен загружаться через обычный endpoint',
        details: 'Job-based импорт поддерживается только для .epub, .fb2, .csv',
      });
    });
  });

  describe('createHandleGetImportJobStatus', () => {
    it('returns public import job for owner', async () => {
      const store = createInMemoryImportJobStore(baseJob());
      const handler = createHandleGetImportJobStatus(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.equal((res.body as { public: boolean }).public, true);
      assert.equal(
        res.headers['Cache-Control'],
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );
      expect(mocks.toPublicImportJob).toHaveBeenCalled();
    });

    it('passes compact flag when query compact=1', async () => {
      const store = createInMemoryImportJobStore(baseJob());
      const handler = createHandleGetImportJobStatus(makeDeps(store));
      const res = mockRes();

      await handler(mockReq({ query: { compact: '1' } }) as never, res as never);

      expect(mocks.toPublicImportJob).toHaveBeenCalledWith(expect.anything(), { compact: true });
    });

    it('returns 401 when user is missing', async () => {
      const store = createInMemoryImportJobStore(baseJob());
      const handler = createHandleGetImportJobStatus(makeDeps(store));
      const res = mockRes();

      await handler(mockReq({ user: undefined }) as never, res as never);

      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when job belongs to another project', async () => {
      const store = createInMemoryImportJobStore(baseJob({ projectId: 'other-proj' }));
      const handler = createHandleGetImportJobStatus(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.equal(res.statusCode, 404);
    });

    it('returns 404 when job not found', async () => {
      const store = createInMemoryImportJobStore();
      const handler = createHandleGetImportJobStatus(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Import job not found' });
    });

    it('returns 404 for foreign job', async () => {
      const store = createInMemoryImportJobStore(
        baseJob({ userId: 'other-user', projectId: 'proj-1' })
      );
      const handler = createHandleGetImportJobStatus(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Import job not found' });
    });
  });

  describe('createHandleCancelImportJob', () => {
    it('requests cancel for active job', async () => {
      const store = createInMemoryImportJobStore(baseJob({ status: 'processing' }));
      const handler = createHandleCancelImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.deepEqual(res.body, { success: true });
      expect(store.requestCancel).toHaveBeenCalledWith('job-1');
    });

    it('returns success without cancel for completed job', async () => {
      const store = createInMemoryImportJobStore(baseJob({ status: 'completed' }));
      const handler = createHandleCancelImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.deepEqual(res.body, { success: true });
      expect(store.requestCancel).not.toHaveBeenCalled();
    });

    it('returns success without cancel for error job', async () => {
      const store = createInMemoryImportJobStore(baseJob({ status: 'error' }));
      const handler = createHandleCancelImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.deepEqual(res.body, { success: true });
      expect(store.requestCancel).not.toHaveBeenCalled();
    });

    it('returns success without cancel for already canceled job', async () => {
      const store = createInMemoryImportJobStore(baseJob({ status: 'canceled' }));
      const handler = createHandleCancelImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.deepEqual(res.body, { success: true });
      expect(store.requestCancel).not.toHaveBeenCalled();
    });

    it('returns 401 when user is missing', async () => {
      const store = createInMemoryImportJobStore(baseJob());
      const handler = createHandleCancelImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq({ user: undefined }) as never, res as never);

      assert.equal(res.statusCode, 401);
    });

    it('returns 404 for foreign job on cancel', async () => {
      const store = createInMemoryImportJobStore(baseJob({ userId: 'other-user' }));
      const handler = createHandleCancelImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.equal(res.statusCode, 404);
    });

    it('returns 404 when job not found', async () => {
      const store = createInMemoryImportJobStore();
      const handler = createHandleCancelImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Import job not found' });
    });
  });

  describe('handleSyncChapterImport', () => {
    it('returns 401 when user is missing', async () => {
      const res = mockRes();
      await handleSyncChapterImport(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when project not found', async () => {
      mocks.getProject.mockResolvedValue(null);
      const res = mockRes();
      await handleSyncChapterImport(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 400 when no file uploaded', async () => {
      const res = mockRes();
      await handleSyncChapterImport(mockReq({ file: undefined }) as never, res as never);
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'No file uploaded' });
    });

    it('returns 400 for unsupported sync format', async () => {
      mocks.isSupportedFormat.mockReturnValue(false);
      const res = mockRes();
      await handleSyncChapterImport(
        mockReq({
          file: { buffer: Buffer.from('x'), originalname: 'bad.docx' },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Неподдерживаемый формат файла');
    });

    it('returns 400 when EPUB parse throws', async () => {
      mocks.parseEpubLazy.mockRejectedValue(new Error('corrupt epub'));
      const res = mockRes();
      await handleSyncChapterImport(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Ошибка при парсинге файла');
    });

    it('returns 400 when EPUB has parse errors', async () => {
      mocks.parseEpubLazy.mockResolvedValue({
        metadata: {},
        warnings: [],
        errors: ['bad spine'],
        chapterCount: 0,
        chapterIterator: epubChapterIterator([]),
      });
      const res = mockRes();
      await handleSyncChapterImport(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Ошибки при парсинге файла');
    });

    it('imports single EPUB chapter and returns full chapter', async () => {
      mocks.parseEpubLazy.mockResolvedValue({
        metadata: { title: 'Book' },
        warnings: [],
        errors: [],
        chapterCount: 1,
        chapterIterator: epubChapterIterator([{ title: 'Ch 1', content: 'one' }]),
      });
      const res = mockRes();
      await handleSyncChapterImport(mockReq() as never, res as never);
      assert.deepEqual(res.body, { id: 'ch-1', title: 'Ch 1' });
      expect(mocks.importChaptersBatch).toHaveBeenCalled();
    });

    it('returns multi-chapter response for EPUB with multiple chapters', async () => {
      mocks.importChaptersBatch.mockResolvedValue([
        { sourceIndex: 0, chapterId: 'ch-1', number: 1, title: 'Ch 1', paragraphsCount: 1 },
        { sourceIndex: 1, chapterId: 'ch-2', number: 2, title: 'Ch 2', paragraphsCount: 1 },
      ]);
      mocks.parseEpubLazy.mockResolvedValue({
        metadata: {},
        warnings: [],
        errors: [],
        chapterCount: 2,
        chapterIterator: epubChapterIterator([
          { title: 'Ch 1', content: 'one' },
          { title: 'Ch 2', content: 'two' },
        ]),
      });
      const res = mockRes();
      await handleSyncChapterImport(mockReq() as never, res as never);
      assert.equal((res.body as { count: number }).count, 2);
    });

    it('returns 400 when non-EPUB parse has errors', async () => {
      mocks.parseFile.mockResolvedValue({
        format: 'txt',
        metadata: {},
        chapters: [],
        warnings: [],
        errors: ['invalid txt'],
      });
      const res = mockRes();
      await handleSyncChapterImport(
        mockReq({
          file: { buffer: Buffer.from('text'), originalname: 'chapter.txt' },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Ошибки при парсинге файла');
    });

    it('imports txt file via parseFile path', async () => {
      mocks.parseFile.mockResolvedValue({
        format: 'txt',
        metadata: {},
        chapters: [{ title: 'Ch 1', content: 'hello' }],
        warnings: [],
        errors: [],
      });
      const res = mockRes();
      await handleSyncChapterImport(
        mockReq({
          file: { buffer: Buffer.from('hello'), originalname: 'chapter.txt' },
        }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'ch-1', title: 'Ch 1' });
      expect(mocks.parseFile).toHaveBeenCalled();
    });
  });
});
