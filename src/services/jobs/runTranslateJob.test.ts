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

// Memory job store: strip Redis before any store module loads.
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
    originalText: 'Hello world. This is sample chapter text for translation wiring.',
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

const performTranslation = vi.fn();
const releaseTokens = vi.fn().mockResolvedValue(undefined);
const invalidateProjectAndRelatedCaches = vi.fn().mockResolvedValue(undefined);

const { getProjectFullForRecovery, resetStuckChaptersForRecovery, updateChapter, getChapter } =
  vi.hoisted(() => ({
    getProjectFullForRecovery: vi.fn(),
    resetStuckChaptersForRecovery: vi.fn(),
    updateChapter: vi.fn(),
    getChapter: vi.fn(),
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
    resetStuckChaptersForRecovery: (...args: unknown[]) => resetStuckChaptersForRecovery(...args),
    updateChapter: (...args: unknown[]) => updateChapter(...args),
    getChapter: (...args: unknown[]) => getChapter(...args),
  };
});

vi.mock('../../api/chapterTranslation.js', () => ({
  performTranslation: (...args: unknown[]) => performTranslation(...args),
}));

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

describe('runTranslateJob', () => {
  beforeEach(() => {
    stripRedisEnv();
    vi.resetModules();
    performTranslation.mockReset();
    releaseTokens.mockReset();
    releaseTokens.mockResolvedValue(undefined);
    invalidateProjectAndRelatedCaches.mockReset();
    invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
    getProjectFullForRecovery.mockReset();
    resetStuckChaptersForRecovery.mockReset();
    resetStuckChaptersForRecovery.mockResolvedValue(undefined);
    updateChapter.mockReset();
    updateChapter.mockResolvedValue(true);
    getChapter.mockReset();
  });

  async function loadRunner() {
    const { createTranslateJobStoreFromEnv } = await import('../translateJobStore.js');
    const { runTranslateJob } = await import('./runTranslateJob.js');
    return { store: createTranslateJobStoreFromEnv(), runTranslateJob };
  }

  it('happy path → job completed', async () => {
    const { store, runTranslateJob } = await loadRunner();
    const jobId = 'tj-unit-happy-1';
    const chapter = sampleChapter({ status: 'pending' });
    const project = sampleProject({ chapters: [chapter] });

    getProjectFullForRecovery.mockResolvedValue(project);
    getChapter.mockResolvedValue({
      ...chapter,
      status: 'completed',
      translatedText: 'Привет мир',
      translationMeta: { tokensUsed: 10, duration: 5 },
    });
    performTranslation.mockResolvedValue(undefined);

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
      estimatedTokens: 100,
    });

    await runTranslateJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      userRole: 'author',
      estimatedTokens: 100,
      chapterIds: ['ch-1'],
      stages: 'all',
      translateOnlyEmpty: false,
      translateChapterTitles: false,
    });

    const job = await store.getJob(jobId);
    expect(job?.status).toBe('completed');
    expect(performTranslation).toHaveBeenCalled();
    expect(invalidateProjectAndRelatedCaches).toHaveBeenCalled();
  });

  it('cancel requested → status canceled and tokens released', async () => {
    const { store, runTranslateJob } = await loadRunner();
    const jobId = 'tj-unit-cancel-1';
    const chapter = sampleChapter();
    getProjectFullForRecovery.mockResolvedValue(sampleProject({ chapters: [chapter] }));
    performTranslation.mockImplementation(async () => {
      await store.requestCancel(jobId);
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
      estimatedTokens: 50,
    });

    await runTranslateJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      userRole: 'author',
      estimatedTokens: 50,
      chapterIds: ['ch-1'],
      stages: 'all',
      translateOnlyEmpty: false,
      translateChapterTitles: false,
    });

    const job = await store.getJob(jobId);
    expect(job?.status).toBe('canceled');
    expect(releaseTokens).toHaveBeenCalled();
  });

  it('performTranslation throws → chapter error recorded', async () => {
    const { store, runTranslateJob } = await loadRunner();
    const jobId = 'tj-unit-err-1';
    const chapter = sampleChapter();
    getProjectFullForRecovery.mockResolvedValue(sampleProject({ chapters: [chapter] }));
    performTranslation.mockRejectedValue(new Error('LLM failed'));

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
      estimatedTokens: 50,
    });

    await runTranslateJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      userRole: 'author',
      estimatedTokens: 50,
      chapterIds: ['ch-1'],
      stages: 'all',
      translateOnlyEmpty: false,
      translateChapterTitles: false,
    });

    const job = await store.getJob(jobId);
    expect(job?.chapters[0]?.status).toBe('error');
    expect(job?.errors?.some((e) => e.includes('LLM failed'))).toBe(true);
    expect(job?.status).toBe('completed');
  });

  it('missing project → error status and tokens released', async () => {
    const { store, runTranslateJob } = await loadRunner();
    const jobId = 'tj-unit-missing-1';
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
      estimatedTokens: 50,
    });

    await runTranslateJob({
      jobId,
      projectId: 'proj-1',
      userId: TEST_USER_ID,
      userRole: 'author',
      estimatedTokens: 50,
      chapterIds: ['ch-1'],
      stages: 'all',
      translateOnlyEmpty: false,
      translateChapterTitles: false,
    });

    const job = await store.getJob(jobId);
    expect(job?.status).toBe('error');
    expect(releaseTokens).toHaveBeenCalledWith(
      TEST_USER_ID,
      50,
      expect.objectContaining({ useServiceRole: true })
    );
  });
});
