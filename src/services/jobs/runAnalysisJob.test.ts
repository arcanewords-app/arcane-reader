import { beforeEach, describe, expect, it, vi } from 'vitest';

const REDIS_ENV_KEYS = [
  'REDIS_URL',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KV_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

function stripRedisEnv(): void {
  for (const key of REDIS_ENV_KEYS) {
    delete process.env[key];
  }
}

stripRedisEnv();

if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
if (!process.env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = 'unit-test-anon-key';
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service-role-key';
}

const TEST_USER_ID = 'test-user-id';

function sampleChapter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch-1',
    projectId: 'proj-1',
    number: 1,
    title: 'Chapter 1',
    status: 'pending',
    originalText: 'Hello world. This is sample chapter text for analysis wiring.',
    translatedText: '',
    paragraphs: [],
    ...overrides,
  };
}

function sampleProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    userId: TEST_USER_ID,
    title: 'Test Project',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    settings: {},
    glossary: [],
    chapters: [],
    ...overrides,
  };
}

const analyzeChaptersBatch = vi.fn();
const releaseTokens = vi.fn().mockResolvedValue(undefined);
const invalidateProjectAndRelatedCaches = vi.fn().mockResolvedValue(undefined);

const {
  getProjectFullForRecovery,
  getChapter,
  updateChapter,
  addGlossaryEntry,
  updateGlossaryEntry,
  getGlossaryEntry,
} = vi.hoisted(() => ({
  getProjectFullForRecovery: vi.fn(),
  getChapter: vi.fn(),
  updateChapter: vi.fn(),
  addGlossaryEntry: vi.fn(),
  updateGlossaryEntry: vi.fn(),
  getGlossaryEntry: vi.fn(),
}));

vi.mock('../redisCache.js', () => ({
  hasRedisCache: vi.fn(() => false),
  redisPing: vi.fn(async () => {
    throw new Error('Redis not configured');
  }),
  buildRedisKey: vi.fn((...parts: Array<string | number | boolean>) => parts.join(':')),
  redisGetJson: vi.fn(async () => null),
  redisSetJson: vi.fn(async () => undefined),
  redisDelMany: vi.fn(async () => undefined),
  redisDelByPattern: vi.fn(async () => 0),
}));

vi.mock('../supabaseDatabase.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getProjectFullForRecovery: (...args: unknown[]) => getProjectFullForRecovery(...args),
    getChapter: (...args: unknown[]) => getChapter(...args),
    updateChapter: (...args: unknown[]) => updateChapter(...args),
    addGlossaryEntry: (...args: unknown[]) => addGlossaryEntry(...args),
    updateGlossaryEntry: (...args: unknown[]) => updateGlossaryEntry(...args),
    getGlossaryEntry: (...args: unknown[]) => getGlossaryEntry(...args),
  };
});

vi.mock('../engine-integration.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    analyzeChaptersBatch: (...args: unknown[]) => analyzeChaptersBatch(...args),
  };
});

vi.mock('../../middleware/tokenLimits.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, releaseTokens: (...args: unknown[]) => releaseTokens(...args) };
});

vi.mock('../cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches: (...args: unknown[]) =>
    invalidateProjectAndRelatedCaches(...args),
  invalidateUserProjectCaches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('runAnalysisJob', () => {
  beforeEach(() => {
    stripRedisEnv();
    vi.resetModules();
    analyzeChaptersBatch.mockReset();
    releaseTokens.mockReset();
    releaseTokens.mockResolvedValue(undefined);
    invalidateProjectAndRelatedCaches.mockReset();
    invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
    getProjectFullForRecovery.mockReset();
    getChapter.mockReset();
    updateChapter.mockReset();
    updateChapter.mockResolvedValue(true);
    addGlossaryEntry.mockReset();
    addGlossaryEntry.mockResolvedValue(undefined);
    updateGlossaryEntry.mockReset();
    updateGlossaryEntry.mockResolvedValue(undefined);
    getGlossaryEntry.mockReset();
    getGlossaryEntry.mockResolvedValue(null);
  });

  async function loadRunner() {
    const { createAnalysisJobStoreFromEnv } = await import('../analysisJobStore.js');
    const { runAnalysisJob } = await import('./runAnalysisJob.js');
    return { store: createAnalysisJobStoreFromEnv(), runAnalysisJob };
  }

  it('happy path → job completed', async () => {
    const { store, runAnalysisJob } = await loadRunner();
    const jobId = 'aj-unit-happy-1';
    const chapter = sampleChapter();
    getProjectFullForRecovery.mockResolvedValue(sampleProject({ chapters: [chapter] }));
    getChapter.mockResolvedValue(chapter);
    analyzeChaptersBatch.mockResolvedValue({
      chapterResults: [
        {
          chapterId: 'ch-1',
          chapterNumber: 1,
          success: true,
          tokensUsed: 5,
          glossaryAppearanceEntryIds: [],
        },
      ],
      glossaryUpdates: [],
      glossaryUpdatesExisting: [],
      totalTokensUsed: 5,
    });

    await store.createJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      status: 'queued',
      current: 0,
      total: 1,
      chapters: [{ chapterId: 'ch-1', title: 'Chapter 1', status: 'pending' }],
      totalTokensUsed: 0,
      errors: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      cancelRequested: false,
      estimatedTokens: 40,
    });

    await runAnalysisJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      userRole: 'author',
      estimatedTokens: 40,
      chapterIds: ['ch-1'],
    });

    const job = await store.getJob(jobId);
    expect(job?.status).toBe('completed');
    expect(analyzeChaptersBatch).toHaveBeenCalled();
    expect(releaseTokens).toHaveBeenCalled();
    expect(invalidateProjectAndRelatedCaches).toHaveBeenCalled();
  });

  it('cancel requested → canceled', async () => {
    const { store, runAnalysisJob } = await loadRunner();
    const jobId = 'aj-unit-cancel-1';
    const chapter = sampleChapter();
    getProjectFullForRecovery.mockResolvedValue(sampleProject({ chapters: [chapter] }));
    analyzeChaptersBatch.mockResolvedValue({
      chapterResults: [],
      glossaryUpdates: [],
      glossaryUpdatesExisting: [],
      totalTokensUsed: 0,
    });

    await store.createJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      status: 'queued',
      current: 0,
      total: 1,
      chapters: [{ chapterId: 'ch-1', title: 'Chapter 1', status: 'pending' }],
      totalTokensUsed: 0,
      errors: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      cancelRequested: false,
      estimatedTokens: 40,
    });

    await store.requestCancel(jobId);

    await runAnalysisJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      userRole: 'author',
      estimatedTokens: 40,
      chapterIds: ['ch-1'],
    });

    const job = await store.getJob(jobId);
    expect(job?.status).toBe('canceled');
    expect(releaseTokens).toHaveBeenCalled();
  });

  it('missing project → error status and tokens released', async () => {
    const { store, runAnalysisJob } = await loadRunner();
    const jobId = 'aj-unit-missing-1';
    getProjectFullForRecovery.mockResolvedValue(null);

    await store.createJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      status: 'queued',
      current: 0,
      total: 1,
      chapters: [{ chapterId: 'ch-1', title: 'Chapter 1', status: 'pending' }],
      totalTokensUsed: 0,
      errors: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      cancelRequested: false,
      estimatedTokens: 40,
    });

    await runAnalysisJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      userRole: 'author',
      estimatedTokens: 40,
      chapterIds: ['ch-1'],
    });

    const job = await store.getJob(jobId);
    expect(job?.status).toBe('error');
    expect(releaseTokens).toHaveBeenCalledWith(
      TEST_USER_ID,
      40,
      expect.objectContaining({ useServiceRole: true })
    );
  });

  it('analyzeChaptersBatch throws → job error', async () => {
    const { store, runAnalysisJob } = await loadRunner();
    const jobId = 'aj-unit-batch-err-1';
    const chapter = sampleChapter();
    getProjectFullForRecovery.mockResolvedValue(sampleProject({ chapters: [chapter] }));
    analyzeChaptersBatch.mockRejectedValue(new Error('batch failed'));

    await store.createJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      status: 'queued',
      current: 0,
      total: 1,
      chapters: [{ chapterId: 'ch-1', title: 'Chapter 1', status: 'pending' }],
      totalTokensUsed: 0,
      errors: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      cancelRequested: false,
      estimatedTokens: 40,
    });

    await runAnalysisJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      userRole: 'author',
      estimatedTokens: 40,
      chapterIds: ['ch-1'],
    });

    const job = await store.getJob(jobId);
    expect(job?.status).toBe('error');
    expect(job?.errors?.some((e) => e.includes('batch failed'))).toBe(true);
    expect(releaseTokens).toHaveBeenCalled();
  });
});
