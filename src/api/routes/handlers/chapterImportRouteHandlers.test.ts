import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportJobState, ImportJobStore } from '../../../services/importJobStore.js';
import type { RouteDeps } from '../deps.js';

const mockGetProject = vi.fn();
const mockRunAsyncImportJob = vi.fn();
const mockHandleServiceError = vi.fn(() => false);
const mockGenerateImportJobId = vi.fn(() => 'job-test-1');
const mockToPublicImportJob = vi.fn((job: ImportJobState, _options?: { compact?: boolean }) => ({
  jobId: job.jobId,
  status: job.status,
  progress: 0,
  public: true,
}));
const mockIsSupportedFormat = vi.fn((filename: string) => /\.(epub|fb2|csv|txt)$/i.test(filename));

vi.mock('../../../services/supabaseClient.js', () => ({
  supabase: {},
  createClientWithToken: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock('../../../logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../services/supabase/domains/projects.js', () => ({
  getProject: mockGetProject,
}));

vi.mock('../../../services/import/index.js', () => ({
  isSupportedFormat: (filename: string) => mockIsSupportedFormat(filename),
  parseFile: vi.fn(),
  parseEpubLazy: vi.fn(),
  getProjectTypeFromFormat: vi.fn(),
}));

vi.mock('../../routeHelpers.js', () => ({
  generateImportJobId: () => mockGenerateImportJobId(),
  toPublicImportJob: (job: ImportJobState, options?: { compact?: boolean }) =>
    mockToPublicImportJob(job, options),
  decodeMultipartFilename: (name: string) => name,
  IMPORT_JOB_FORMATS: new Set(['epub', 'fb2', 'csv']),
  IMPORT_JOB_TTL_SECONDS: 3600,
  IMPORT_CHAPTER_BATCH_SIZE: 20,
  invalidateUserProjectCaches: vi.fn(),
}));

vi.mock('../../chapters/helpers/asyncImportJob.js', () => ({
  runAsyncImportJob: mockRunAsyncImportJob,
}));

vi.mock('../../../middleware/serviceHealth.js', () => ({
  handleServiceError: mockHandleServiceError,
}));

const { createHandleStartImportJob, createHandleGetImportJobStatus, createHandleCancelImportJob } =
  await import('./chapterImportRouteHandlers.js');

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
    mockGetProject.mockResolvedValue({
      id: 'proj-1',
      chapters: [],
      metadata: {},
      type: 'text',
    });
    mockRunAsyncImportJob.mockResolvedValue(undefined);
    mockHandleServiceError.mockReturnValue(false);
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
      expect(mockRunAsyncImportJob).toHaveBeenCalledWith(
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

    it('returns 404 when project not found', async () => {
      mockGetProject.mockResolvedValue(null);
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
      expect(mockToPublicImportJob).toHaveBeenCalled();
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

    it('returns 404 when job not found', async () => {
      const store = createInMemoryImportJobStore();
      const handler = createHandleCancelImportJob(makeDeps(store));
      const res = mockRes();

      await handler(mockReq() as never, res as never);

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Import job not found' });
    });
  });
});
