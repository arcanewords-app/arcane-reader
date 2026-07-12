import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ImportJobState, ImportJobStore } from '../../../services/importJobStore.js';
import type { AsyncImportJobParams } from './asyncImportJob.js';

const parseEpubLazy = vi.fn();
const parseFile = vi.fn();
const importChaptersBatch = vi.fn();
const updateProject = vi.fn();
const uploadFile = vi.fn();
const invalidateProjectAndRelatedCaches = vi.fn();

vi.mock('../../../services/import/index.js', () => ({
  parseEpubLazy,
  parseFile,
  getProjectTypeFromFormat: (format: string) => (format === 'epub' ? 'book' : 'text'),
}));

vi.mock('../../../services/supabase/domains/chapters.js', () => ({
  importChaptersBatch,
}));

vi.mock('../../../services/supabase/domains/projects.js', () => ({
  updateProject,
}));

vi.mock('../../../services/storage.js', () => ({
  uploadFile,
  generateUniqueFilename: vi.fn(() => 'cover.jpg'),
}));

vi.mock('../../../services/cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches,
}));

vi.mock('../../routeHelpers.js', () => ({
  IMPORT_CHAPTER_BATCH_SIZE: 20,
  IMPORT_JOB_MAX_CHAPTERS_SNAPSHOT: 50,
  IMPORT_JOB_PROGRESS_UPDATE_EVERY: 5,
  IMPORT_JOB_PROGRESS_UPDATE_MAX_STALENESS_MS: 2000,
  IMPORT_JOB_TTL_SECONDS: 3600,
}));

const { runAsyncImportJob } = await import('./asyncImportJob.js');

function createInMemoryImportJobStore(initialJob: ImportJobState): ImportJobStore {
  const jobs = new Map<string, ImportJobState>();
  const cancelFlags = new Set<string>();
  jobs.set(initialJob.jobId, { ...initialJob });

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

function baseParams(
  store: ImportJobStore,
  overrides: Partial<AsyncImportJobParams> = {}
): AsyncImportJobParams {
  return {
    jobId: 'job-1',
    projectId: 'proj-1',
    userId: 'user-1',
    token: 'token-1',
    buffer: Buffer.from('epub'),
    filename: 'book.epub',
    extension: 'epub',
    project: { metadata: {}, chapters: { length: 0 } },
    importJobStore: store,
    ...overrides,
  };
}

async function* chapterIterator(
  chapters: Array<{ title: string; content: string }>
): AsyncGenerator<{ title: string; content: string }, void, unknown> {
  for (const chapter of chapters) {
    yield chapter;
  }
}

describe('runAsyncImportJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importChaptersBatch.mockResolvedValue([
      { sourceIndex: 0, chapterId: 'ch-1', number: 1, title: 'Ch 1', paragraphsCount: 1 },
    ]);
    updateProject.mockResolvedValue(undefined);
    uploadFile.mockResolvedValue({ publicUrl: 'https://cdn/cover.jpg' });
    invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
  });

  it('EPUB initial parse errors set job error', async () => {
    parseEpubLazy.mockResolvedValue({
      metadata: {},
      warnings: [],
      errors: ['bad OPF'],
      chapterCount: 0,
      chapterIterator: chapterIterator([]),
    });

    const store = createInMemoryImportJobStore(baseJob());
    await runAsyncImportJob(baseParams(store));

    const finalJob = await store.getJob('job-1');
    expect(finalJob?.status).toBe('error');
    expect(finalJob?.errors).toEqual(['bad OPF']);
    expect(importChaptersBatch).not.toHaveBeenCalled();
  });

  it('EPUB happy path completes job and imports chapters', async () => {
    parseEpubLazy.mockResolvedValue({
      metadata: { title: 'Book' },
      warnings: [],
      errors: [],
      chapterCount: 2,
      chapterIterator: chapterIterator([
        { title: 'Ch 1', content: 'one' },
        { title: 'Ch 2', content: 'two' },
      ]),
    });

    const store = createInMemoryImportJobStore(baseJob());
    await runAsyncImportJob(baseParams(store));

    const finalJob = await store.getJob('job-1');
    expect(finalJob?.status).toBe('completed');
    expect(finalJob?.phase).toBe('finalizing');
    expect(importChaptersBatch).toHaveBeenCalled();
    expect(invalidateProjectAndRelatedCaches).toHaveBeenCalledWith('user-1', 'proj-1', 'token-1', {
      useServiceRole: true,
    });
    expect(store.setTtl).toHaveBeenCalled();
  });

  it('EPUB zero chapters sets job error without batch flush', async () => {
    parseEpubLazy.mockResolvedValue({
      metadata: {},
      warnings: [],
      errors: [],
      chapterCount: 0,
      chapterIterator: chapterIterator([]),
    });

    const store = createInMemoryImportJobStore(baseJob());
    await runAsyncImportJob(baseParams(store));

    const finalJob = await store.getJob('job-1');
    expect(finalJob?.status).toBe('error');
    expect(finalJob?.errors).toContain('Файл не содержит глав');
    expect(importChaptersBatch).not.toHaveBeenCalled();
  });

  it('cancels job mid EPUB loop', async () => {
    parseEpubLazy.mockResolvedValue({
      metadata: {},
      warnings: [],
      errors: [],
      chapterCount: 3,
      chapterIterator: chapterIterator([
        { title: 'Ch 1', content: 'one' },
        { title: 'Ch 2', content: 'two' },
        { title: 'Ch 3', content: 'three' },
      ]),
    });

    const store = createInMemoryImportJobStore(baseJob());
    store.isCancelRequested = vi.fn(async (jobId) => {
      const job = await store.getJob(jobId);
      return (job?.current ?? 0) >= 1;
    });

    await runAsyncImportJob(baseParams(store));

    const finalJob = await store.getJob('job-1');
    expect(finalJob?.status).toBe('canceled');
  });

  it('FB2 happy path completes and flushes chapters', async () => {
    parseFile.mockResolvedValue({
      format: 'fb2',
      metadata: { title: 'FB2 Book' },
      chapters: [
        { title: 'Ch 1', content: 'one' },
        { title: 'Ch 2', content: 'two' },
      ],
      warnings: [],
      errors: [],
    });

    const store = createInMemoryImportJobStore(baseJob({ format: 'fb2', filename: 'book.fb2' }));
    await runAsyncImportJob(
      baseParams(store, {
        extension: 'fb2',
        filename: 'book.fb2',
        buffer: Buffer.from('fb2'),
      })
    );

    const finalJob = await store.getJob('job-1');
    expect(finalJob?.status).toBe('completed');
    expect(finalJob?.phase).toBe('finalizing');
    expect(importChaptersBatch).toHaveBeenCalled();
    expect(updateProject).toHaveBeenCalled();
  });

  it('CSV zero chapters sets job error', async () => {
    parseFile.mockResolvedValue({
      format: 'csv',
      metadata: {},
      chapters: [],
      warnings: [],
      errors: [],
    });

    const store = createInMemoryImportJobStore(baseJob({ format: 'csv', filename: 'book.csv' }));
    await runAsyncImportJob(
      baseParams(store, {
        extension: 'csv',
        filename: 'book.csv',
        buffer: Buffer.from('csv'),
      })
    );

    const finalJob = await store.getJob('job-1');
    expect(finalJob?.status).toBe('error');
    expect(finalJob?.errors).toContain('Файл не содержит глав');
  });

  it('cancels job mid FB2 loop', async () => {
    parseFile.mockResolvedValue({
      format: 'fb2',
      metadata: {},
      chapters: [
        { title: 'Ch 1', content: 'one' },
        { title: 'Ch 2', content: 'two' },
        { title: 'Ch 3', content: 'three' },
      ],
      warnings: [],
      errors: [],
    });

    const store = createInMemoryImportJobStore(baseJob({ format: 'fb2', filename: 'book.fb2' }));
    store.isCancelRequested = vi.fn(async (jobId) => {
      const job = await store.getJob(jobId);
      return (job?.current ?? 0) >= 1;
    });

    await runAsyncImportJob(
      baseParams(store, {
        extension: 'fb2',
        filename: 'book.fb2',
        buffer: Buffer.from('fb2'),
      })
    );

    const finalJob = await store.getJob('job-1');
    expect(finalJob?.status).toBe('canceled');
  });

  it('completes when cache invalidation fails', async () => {
    parseEpubLazy.mockResolvedValue({
      metadata: {},
      warnings: [],
      errors: [],
      chapterCount: 1,
      chapterIterator: chapterIterator([{ title: 'Ch 1', content: 'one' }]),
    });
    invalidateProjectAndRelatedCaches.mockRejectedValue(new Error('redis down'));

    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const store = createInMemoryImportJobStore(baseJob());
    await runAsyncImportJob(baseParams(store, { log }));

    const finalJob = await store.getJob('job-1');
    expect(finalJob?.status).toBe('completed');
    expect(log.warn).toHaveBeenCalled();
  });

  it('sets processing phase before parse', async () => {
    parseEpubLazy.mockResolvedValue({
      metadata: {},
      warnings: [],
      errors: [],
      chapterCount: 1,
      chapterIterator: chapterIterator([{ title: 'Ch 1', content: 'one' }]),
    });

    const store = createInMemoryImportJobStore(baseJob());
    await runAsyncImportJob(baseParams(store));

    expect(store.updateJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'processing', phase: 'parsing' })
    );
  });

  it('FB2 parse errors set job error', async () => {
    parseFile.mockResolvedValue({
      format: 'fb2',
      metadata: {},
      chapters: [],
      warnings: [],
      errors: ['Invalid FB2 structure'],
    });

    const store = createInMemoryImportJobStore(baseJob({ format: 'fb2', filename: 'book.fb2' }));
    await runAsyncImportJob(
      baseParams(store, {
        extension: 'fb2',
        filename: 'book.fb2',
        buffer: Buffer.from('fb2'),
      })
    );

    const finalJob = await store.getJob('job-1');
    expect(finalJob?.status).toBe('error');
    expect(finalJob?.errors).toEqual(['Invalid FB2 structure']);
    expect(importChaptersBatch).not.toHaveBeenCalled();
  });

  it('first chapter updates project metadata on EPUB import', async () => {
    parseEpubLazy.mockResolvedValue({
      metadata: { title: 'Imported Title' },
      warnings: [],
      errors: [],
      chapterCount: 1,
      chapterIterator: chapterIterator([{ title: 'Ch 1', content: 'one' }]),
    });

    const store = createInMemoryImportJobStore(baseJob());
    await runAsyncImportJob(
      baseParams(store, {
        project: { metadata: { title: 'Old' }, chapters: { length: 0 } },
      })
    );

    expect(updateProject).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({ metadata: expect.objectContaining({ title: 'Imported Title' }) }),
      'user-1',
      'token-1',
      { useServiceRole: true }
    );
  });

  it('uncaught exception sets job error with message', async () => {
    parseEpubLazy.mockRejectedValue(new Error('parse boom'));

    const store = createInMemoryImportJobStore(baseJob());
    await runAsyncImportJob(baseParams(store));

    const finalJob = await store.getJob('job-1');
    expect(finalJob?.status).toBe('error');
    expect(finalJob?.errors).toEqual(['parse boom']);
  });

  it('returns early when job record is missing', async () => {
    const store = createInMemoryImportJobStore(baseJob());
    await store.deleteJob('job-1');

    await runAsyncImportJob(baseParams(store));

    expect(parseEpubLazy).not.toHaveBeenCalled();
  });
});
