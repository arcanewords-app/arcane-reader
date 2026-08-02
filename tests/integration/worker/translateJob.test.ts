import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseMock, resetMocks } from '../helpers/mockSupabase.js';
import { sampleChapter, sampleProject, TEST_USER_ID } from '../helpers/fixtures.js';
import { stripRedisEnv, ensureDummySupabaseEnv } from '../setup.js';

// Ensure Memory job stores even if developer .env has Upstash/Redis.
stripRedisEnv();
ensureDummySupabaseEnv();

const performTranslation = vi.fn();
const releaseTokens = vi.fn().mockResolvedValue(undefined);
const invalidateProjectAndRelatedCaches = vi.fn().mockResolvedValue(undefined);
const analyzeChaptersBatch = vi.fn();

vi.mock('../../../src/services/redisCache.js', async () => {
  const { installRedisCacheMocks } = await import('../helpers/mockRedis.js');
  return installRedisCacheMocks();
});

vi.mock('../../../src/services/supabaseDatabase.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { createSupabaseDatabaseOverlay } = await import('../helpers/mockSupabase.js');
  return { ...actual, ...createSupabaseDatabaseOverlay() };
});
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { createProjectsDomainOverlay } = await import('../helpers/mockSupabase.js');
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/chapters.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { createChaptersDomainOverlay } = await import('../helpers/mockSupabase.js');
  return { ...actual, ...createChaptersDomainOverlay() };
});

vi.mock('../../../src/api/chapterTranslation.js', () => ({
  performTranslation: (...args: unknown[]) => performTranslation(...args),
}));

vi.mock('../../../src/middleware/tokenLimits.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, releaseTokens: (...args: unknown[]) => releaseTokens(...args) };
});

vi.mock('../../../src/services/cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches: (...args: unknown[]) =>
    invalidateProjectAndRelatedCaches(...args),
  invalidateUserProjectCaches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/services/engine-integration.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    analyzeChaptersBatch: (...args: unknown[]) => analyzeChaptersBatch(...args),
  };
});

describe('runTranslateJob (integration)', () => {
  beforeEach(() => {
    resetMocks();
    performTranslation.mockReset();
    releaseTokens.mockReset();
    releaseTokens.mockResolvedValue(undefined);
    invalidateProjectAndRelatedCaches.mockReset();
    invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
  });

  it('happy payload → job completed', async () => {
    const { createTranslateJobStoreFromEnv } = await import(
      '../../../src/services/translateJobStore.js'
    );
    const { runTranslateJob } = await import('../../../src/services/jobs/runTranslateJob.js');

    const store = createTranslateJobStoreFromEnv();
    const jobId = 'tj-happy-1';
    const chapter = sampleChapter({ status: 'pending' });
    const project = sampleProject({ chapters: [chapter] });

    getSupabaseMock('getProjectFullForRecovery').mockResolvedValue(project);
    getSupabaseMock('resetStuckChaptersForRecovery').mockResolvedValue(undefined);
    getSupabaseMock('updateChapter').mockResolvedValue(true);
    getSupabaseMock('getChapter').mockResolvedValue({
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
  });

  it('cancel requested → status canceled', async () => {
    const { createTranslateJobStoreFromEnv } = await import(
      '../../../src/services/translateJobStore.js'
    );
    const { runTranslateJob } = await import('../../../src/services/jobs/runTranslateJob.js');

    const store = createTranslateJobStoreFromEnv();
    const jobId = 'tj-cancel-1';
    const chapter = sampleChapter();
    getSupabaseMock('getProjectFullForRecovery').mockResolvedValue(
      sampleProject({ chapters: [chapter] })
    );
    getSupabaseMock('resetStuckChaptersForRecovery').mockResolvedValue(undefined);
    getSupabaseMock('updateChapter').mockResolvedValue(true);
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
    const { createTranslateJobStoreFromEnv } = await import(
      '../../../src/services/translateJobStore.js'
    );
    const { runTranslateJob } = await import('../../../src/services/jobs/runTranslateJob.js');

    const store = createTranslateJobStoreFromEnv();
    const jobId = 'tj-err-1';
    const chapter = sampleChapter();
    getSupabaseMock('getProjectFullForRecovery').mockResolvedValue(
      sampleProject({ chapters: [chapter] })
    );
    getSupabaseMock('resetStuckChaptersForRecovery').mockResolvedValue(undefined);
    getSupabaseMock('updateChapter').mockResolvedValue(true);
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
  });

  it('missing project → error status and tokens released', async () => {
    const { createTranslateJobStoreFromEnv } = await import(
      '../../../src/services/translateJobStore.js'
    );
    const { runTranslateJob } = await import('../../../src/services/jobs/runTranslateJob.js');

    const store = createTranslateJobStoreFromEnv();
    const jobId = 'tj-missing-1';
    getSupabaseMock('getProjectFullForRecovery').mockResolvedValue(null);

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

describe('runAnalysisJob smoke (integration)', () => {
  beforeEach(() => {
    resetMocks();
    releaseTokens.mockReset();
    releaseTokens.mockResolvedValue(undefined);
    analyzeChaptersBatch.mockReset();
  });

  it('happy analysis → completed', async () => {
    const { createAnalysisJobStoreFromEnv } = await import(
      '../../../src/services/analysisJobStore.js'
    );
    const { runAnalysisJob } = await import('../../../src/services/jobs/runAnalysisJob.js');

    const store = createAnalysisJobStoreFromEnv();
    const jobId = 'aj-happy-1';
    const chapter = sampleChapter();
    getSupabaseMock('getProjectFullForRecovery').mockResolvedValue(
      sampleProject({ chapters: [chapter] })
    );
    getSupabaseMock('getChapter').mockResolvedValue(chapter);
    getSupabaseMock('updateChapter').mockResolvedValue(true);
    getSupabaseMock('addGlossaryEntry').mockResolvedValue(undefined);
    getSupabaseMock('updateGlossaryEntry').mockResolvedValue(undefined);
    getSupabaseMock('getGlossaryEntry').mockResolvedValue(null);
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
  });

  it('cancel requested → canceled', async () => {
    const { createAnalysisJobStoreFromEnv } = await import(
      '../../../src/services/analysisJobStore.js'
    );
    const { runAnalysisJob } = await import('../../../src/services/jobs/runAnalysisJob.js');

    const store = createAnalysisJobStoreFromEnv();
    const jobId = 'aj-cancel-1';
    const chapter = sampleChapter();
    getSupabaseMock('getProjectFullForRecovery').mockResolvedValue(
      sampleProject({ chapters: [chapter] })
    );
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

    // Pre-set cancel so job exits cancel path after batch
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
  });
});
