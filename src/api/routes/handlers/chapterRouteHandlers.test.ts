import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import type { RouteDeps } from '../deps.js';

const {
  mockGetProject,
  mockVerifyChapterAccess,
  mockGetChapterStatusRow,
  mockGetChapter,
  mockDeleteChapter,
  mockUpdateChapter,
  mockUpdateChapterNumber,
  mockUpdateChapterStatus,
  mockUpdateChaptersOrder,
  mockBulkDeleteChapters,
  mockDuplicateChaptersInProject,
  mockMarkChaptersAsTranslatedBatch,
  mockUpdateParagraph,
  mockResetStuckChaptersForRecovery,
  mockAddGlossaryEntry,
  mockUpdateGlossaryEntry,
  mockHandleServiceError,
  mockRespondRouteError,
  mockInvalidateUserProjectCaches,
  mockInvalidateProjectAndRelatedCaches,
  mockGetTranslationProgress,
  mockPerformTranslation,
  mockCheckTokenLimit,
  mockIncrementTokenUsage,
  mockReserveTokens,
  mockReleaseTokens,
  mockGetStageModel,
  mockAnalyzeChaptersBatch,
  mockGetAgentForProject,
  mockResolveEffectiveOriginalText,
  mockToPublicAnalysisJob,
  mockToPublicTranslateJob,
  mockSyncTranslationChunksToParagraphs,
  mockSyncTranslationToParagraphs,
  mockMergeParagraphsToText,
  mockMergeGlossaryAppearanceForChapter,
  mockIsPreferAsync,
  mockIsBullAvailable,
  mockAddAnalysisJob,
  mockAddTranslateJob,
  mockGetChapterTranslateQueue,
  mockGetChapterStats,
  mockComputeCriticContentFingerprint,
  mockRunChapterCritic,
  mockComputeCriticInputStats,
  mockAnalysisJobStore,
  mockTranslateJobStore,
  CriticInputTooLargeError,
  CriticChapterTooLongError,
  CriticNoTranslationError,
  CriticOutputTruncatedError,
} = vi.hoisted(() => {
  class CriticInputTooLargeError extends Error {
    totalChars: number;
    maxChars: number;
    constructor(totalChars: number, maxChars: number) {
      super('too large');
      this.totalChars = totalChars;
      this.maxChars = maxChars;
    }
  }
  class CriticChapterTooLongError extends Error {
    constructor(message = 'chapter too long') {
      super(message);
    }
  }
  class CriticNoTranslationError extends Error {
    constructor(message = 'no translation') {
      super(message);
    }
  }
  class CriticOutputTruncatedError extends Error {
    constructor() {
      super('truncated');
    }
  }

  return {
    mockGetProject: vi.fn(),
    mockVerifyChapterAccess: vi.fn().mockResolvedValue(true),
    mockGetChapterStatusRow: vi.fn(),
    mockGetChapter: vi.fn(),
    mockDeleteChapter: vi.fn(),
    mockUpdateChapter: vi.fn(),
    mockUpdateChapterNumber: vi.fn(),
    mockUpdateChapterStatus: vi.fn(),
    mockUpdateChaptersOrder: vi.fn(),
    mockBulkDeleteChapters: vi.fn(),
    mockDuplicateChaptersInProject: vi.fn(),
    mockMarkChaptersAsTranslatedBatch: vi.fn(),
    mockUpdateParagraph: vi.fn(),
    mockResetStuckChaptersForRecovery: vi.fn(),
    mockAddGlossaryEntry: vi.fn(),
    mockUpdateGlossaryEntry: vi.fn(),
    mockHandleServiceError: vi.fn(() => false),
    mockRespondRouteError: vi.fn(() => true),
    mockInvalidateUserProjectCaches: vi.fn(),
    mockInvalidateProjectAndRelatedCaches: vi.fn(),
    mockGetTranslationProgress: vi.fn(),
    mockPerformTranslation: vi.fn(),
    mockCheckTokenLimit: vi.fn(),
    mockIncrementTokenUsage: vi.fn(),
    mockReserveTokens: vi.fn(),
    mockReleaseTokens: vi.fn(),
    mockGetStageModel: vi.fn(() => 'gpt-test'),
    mockAnalyzeChaptersBatch: vi.fn(),
    mockGetAgentForProject: vi.fn(),
    mockResolveEffectiveOriginalText: vi.fn(
      (ch: { originalText?: string }) => ch.originalText ?? ''
    ),
    mockToPublicAnalysisJob: vi.fn((job: Record<string, unknown>) => ({ ...job, public: true })),
    mockToPublicTranslateJob: vi.fn((job: Record<string, unknown>) => ({ ...job, public: true })),
    mockSyncTranslationChunksToParagraphs: vi.fn(),
    mockSyncTranslationToParagraphs: vi.fn(),
    mockMergeParagraphsToText: vi.fn(() => 'merged text'),
    mockMergeGlossaryAppearanceForChapter: vi.fn(),
    mockIsPreferAsync: vi.fn(() => false),
    mockIsBullAvailable: vi.fn(() => false),
    mockAddAnalysisJob: vi.fn(),
    mockAddTranslateJob: vi.fn(),
    mockGetChapterTranslateQueue: vi.fn(),
    mockGetChapterStats: vi.fn(() => ({ wordCount: 100 })),
    mockComputeCriticContentFingerprint: vi.fn(() => 'fp-1'),
    mockRunChapterCritic: vi.fn(),
    mockComputeCriticInputStats: vi.fn(() => ({
      tooLarge: false,
      totalChars: 500,
      maxInputChars: 50_000,
    })),
    mockAnalysisJobStore: {
      getJob: vi.fn(),
      listByProject: vi.fn(),
      hasActiveJobForUser: vi.fn(),
      createJob: vi.fn(),
      addToProjectIndex: vi.fn(),
      setTtl: vi.fn(),
      setUserActiveJob: vi.fn(),
      requestCancel: vi.fn(),
      updateJob: vi.fn(),
      removeFromProjectIndex: vi.fn(),
      clearUserActiveJob: vi.fn(),
    },
    mockTranslateJobStore: {
      getJob: vi.fn(),
      listByProject: vi.fn(),
      hasActiveJobForUser: vi.fn(),
      createJob: vi.fn(),
      addToProjectIndex: vi.fn(),
      setTtl: vi.fn(),
      setUserActiveJob: vi.fn(),
      requestCancel: vi.fn(),
      updateJob: vi.fn(),
      removeFromProjectIndex: vi.fn(),
      clearUserActiveJob: vi.fn(),
    },
    CriticInputTooLargeError,
    CriticChapterTooLongError,
    CriticNoTranslationError,
    CriticOutputTruncatedError,
  };
});

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
  verifyChapterAccess: mockVerifyChapterAccess,
  getChapterStatusRow: mockGetChapterStatusRow,
  duplicateChaptersInProject: mockDuplicateChaptersInProject,
  bulkDeleteChapters: mockBulkDeleteChapters,
  resetStuckChaptersForRecovery: mockResetStuckChaptersForRecovery,
}));

vi.mock('../../../services/supabase/domains/chapters.js', () => ({
  getChapter: mockGetChapter,
  deleteChapter: mockDeleteChapter,
  updateChapter: mockUpdateChapter,
  updateChapterNumber: mockUpdateChapterNumber,
  updateChaptersOrder: mockUpdateChaptersOrder,
  markChaptersAsTranslatedBatch: mockMarkChaptersAsTranslatedBatch,
}));

vi.mock('../../../services/supabase/domains/glossary.js', () => ({
  addGlossaryEntry: mockAddGlossaryEntry,
  updateGlossaryEntry: mockUpdateGlossaryEntry,
}));

vi.mock('../../../services/supabase/domains/paragraphs.js', () => ({
  updateParagraph: mockUpdateParagraph,
}));

vi.mock('../../../services/supabase/domains/readerProgress.js', () => ({
  updateChapterStatus: mockUpdateChapterStatus,
}));

vi.mock('../../../middleware/serviceHealth.js', () => ({
  handleServiceError: mockHandleServiceError,
}));

vi.mock('../../../middleware/routeDebugError.js', () => ({
  respondRouteError: mockRespondRouteError,
}));

vi.mock('../../../middleware/tokenLimits.js', () => ({
  checkTokenLimit: mockCheckTokenLimit,
  incrementTokenUsage: mockIncrementTokenUsage,
  reserveTokens: mockReserveTokens,
  releaseTokens: mockReleaseTokens,
}));

vi.mock('../../../services/cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches: (...args: unknown[]) =>
    mockInvalidateProjectAndRelatedCaches(...args),
}));

vi.mock('../../routeHelpers.js', () => ({
  invalidateUserProjectCaches: mockInvalidateUserProjectCaches,
  getTranslationProgress: mockGetTranslationProgress,
  toPublicAnalysisJob: mockToPublicAnalysisJob,
  toPublicTranslateJob: mockToPublicTranslateJob,
  generateAnalysisJobId: vi.fn(() => 'analysis-job-1'),
  generateTranslateJobId: vi.fn(() => 'translate-job-1'),
  effectiveJobLanguageFields: vi.fn(() => ({})),
  warnLanguageOverrideWithGlossary: vi.fn(),
  translationCancelKey: vi.fn((p: string, c: string) => `${p}:${c}`),
  translationCancelRegistry: new Map(),
  MARK_TRANSLATED_BATCH_CHUNK_SIZE: 100,
  ANALYSIS_JOB_TTL_SECONDS: 3600,
  TRANSLATE_JOB_TTL_SECONDS: 3600,
  SERVER_START_TIME_MS: Date.now(),
}));

vi.mock('../../chapterTranslation.js', () => ({
  performTranslation: mockPerformTranslation,
  mergeGlossaryAppearanceForChapter: (...args: unknown[]) =>
    mockMergeGlossaryAppearanceForChapter(...args),
  syncTranslationChunksToParagraphs: (...args: unknown[]) =>
    mockSyncTranslationChunksToParagraphs(...args),
  syncTranslationToParagraphs: mockSyncTranslationToParagraphs,
  logTranslationCoverageIfIncomplete: vi.fn(),
}));

vi.mock('../../../services/engine-integration.js', () => ({
  analyzeChaptersBatch: mockAnalyzeChaptersBatch,
  getStageModel: mockGetStageModel,
  getAgentForProject: mockGetAgentForProject,
}));

vi.mock('../../../services/chapterQueue.js', () => ({
  addAnalysisJob: mockAddAnalysisJob,
  addTranslateJob: mockAddTranslateJob,
  getChapterTranslateQueue: mockGetChapterTranslateQueue,
  isBullAvailable: mockIsBullAvailable,
}));

vi.mock('../../../debug/context.js', () => ({
  createTraceId: vi.fn(() => 'trace-1'),
  runWithDebugContextAsync: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock('../../../debug/httpCaptureMiddleware.js', () => ({
  setDebugTraceId: vi.fn(),
}));

vi.mock('../../chapters/helpers/effectiveOriginalText.js', () => ({
  resolveEffectiveOriginalText: mockResolveEffectiveOriginalText,
}));

vi.mock('../../chapters/helpers/preferAsync.js', () => ({
  isPreferAsync: mockIsPreferAsync,
}));

vi.mock('../../../storage/database.js', () => ({
  getChapterStats: mockGetChapterStats,
  mergeParagraphsToText: mockMergeParagraphsToText,
}));

vi.mock('../../../services/chapter-critic.js', () => ({
  computeCriticContentFingerprint: mockComputeCriticContentFingerprint,
  runChapterCritic: mockRunChapterCritic,
  computeCriticInputStats: mockComputeCriticInputStats,
  CriticInputTooLargeError,
  CriticChapterTooLongError,
  CriticNoTranslationError,
  CriticOutputTruncatedError,
}));

vi.mock('../../../engine/index.js', () => ({
  GlossaryManager: class {
    glossary: unknown;
    constructor(glossary: unknown) {
      this.glossary = glossary;
    }
    toPromptText() {
      return 'glossary text';
    }
  },
}));

vi.mock('../../../engine/language.js', () => ({
  languageDisplayName: () => 'Russian',
}));

import {
  handleGetChapter,
  handleGetChapterStatus,
  handleDeleteChapter,
  handleDuplicateChapters,
  handleBulkDeleteChapters,
  handleCancelTranslation,
  handleSyncTranslation,
  handleUploadTranslation,
  handleMarkAsTranslated,
  handleMarkAsTranslatedBatch,
  handleChapterCritic,
  handleGetChapterStats,
  handleUpdateChapterTitle,
  handleUpdateChapterNumber,
  handleUpdateChapterStatus,
  handleUpdateChaptersOrder,
  handleUpdateParagraph,
  createHandleAnalyzeBatch,
  createHandleListProjectJobs,
  createHandleGetAnalysisJobStatus,
  createHandleCancelAnalysisJob,
  createHandleTranslateBatch,
  createHandleGetTranslateJobStatus,
  createHandleCancelTranslateJob,
  createHandleTranslateChapter,
} from './chapterRouteHandlers.js';

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
  const { params: paramsOverride, headers: headersOverride, ...rest } = overrides;
  return {
    user: { id: 'user-1', role: 'author' as const },
    token: 'bearer-token',
    params: {
      projectId: 'proj-1',
      chapterId: 'ch-1',
      jobId: 'job-1',
      paragraphId: 'p-1',
      ...(paramsOverride as Record<string, string> | undefined),
    },
    body: {},
    query: {},
    headers: headersOverride ?? {},
    get(name: string) {
      const headers = (headersOverride ?? {}) as Record<string, string>;
      return headers[name.toLowerCase()] ?? headers[name];
    },
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    id: 'req-1',
    ...rest,
  };
}

function makeDeps(): RouteDeps {
  return {
    config: {
      port: 3000,
      openai: { apiKey: 'test-key', model: 'gpt-test', timeout: 60000 },
      translation: {
        maxTokensPerChunk: 3000,
        temperature: 0.7,
        skipEditing: false,
        analysisConcurrency: 4,
      },
      storage: { projectsDir: '/tmp/projects', cacheDir: '/tmp/cache' },
      upload: { maxFileSizeBytes: 1_000_000 },
    },
    configValidation: { valid: true, errors: [] },
    upload: {} as RouteDeps['upload'],
    uploadGlossaryFile: {} as RouteDeps['uploadGlossaryFile'],
    uploadImage: {} as RouteDeps['uploadImage'],
    uploadAvatar: {} as RouteDeps['uploadAvatar'],
    importJobStore: {} as RouteDeps['importJobStore'],
    analysisJobStore: mockAnalysisJobStore as unknown as RouteDeps['analysisJobStore'],
    translateJobStore: mockTranslateJobStore as unknown as RouteDeps['translateJobStore'],
  };
}

function makeChapter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch-1',
    title: 'Chapter 1',
    number: 1,
    status: 'pending',
    originalText: 'Hello world',
    paragraphs: [{ id: 'p-1', index: 0, originalText: 'Hello', translatedText: '' }],
    ...overrides,
  };
}

function makeAnalysisJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-1',
    userId: 'user-1',
    projectId: 'proj-1',
    status: 'running',
    estimatedTokens: 1000,
    chapters: [{ chapterId: 'ch-1', title: 'Chapter 1', status: 'pending' }],
    startedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTranslateJob(overrides: Record<string, unknown> = {}) {
  return makeAnalysisJob({ status: 'queued', ...overrides });
}

function resetDefaults() {
  mockHandleServiceError.mockReturnValue(false);
  mockRespondRouteError.mockReturnValue(true);
  mockVerifyChapterAccess.mockResolvedValue(true);
  mockCheckTokenLimit.mockResolvedValue({ allowed: true, currentUsage: 0, limit: 100_000 });
  mockGetProject.mockResolvedValue({
    id: 'proj-1',
    name: 'Test',
    settings: {},
    sourceLanguage: 'en',
    targetLanguage: 'ru',
  });
  mockResolveEffectiveOriginalText.mockImplementation(
    (ch: { originalText?: string }) => ch.originalText ?? ''
  );
  mockIsPreferAsync.mockReturnValue(false);
  mockIsBullAvailable.mockReturnValue(false);
  mockGetAgentForProject.mockResolvedValue({ glossary: [] });
  mockComputeCriticInputStats.mockReturnValue({
    tooLarge: false,
    totalChars: 500,
    maxInputChars: 50_000,
  });
}

describe('chapterRouteHandlers', () => {
  beforeEach(() => {
    resetDefaults();
    mockInvalidateUserProjectCaches.mockResolvedValue(undefined);
    mockInvalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleGetChapterStatus', () => {
    it('returns chapter status payload', async () => {
      mockGetChapterStatusRow.mockResolvedValue({
        status: 'pending',
        updated_at: new Date().toISOString(),
      });
      const res = mockRes();
      await handleGetChapterStatus(mockReq() as never, res as never);
      assert.deepEqual(res.body, { status: 'pending' });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetChapterStatus(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when project missing', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleGetChapterStatus(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 404 when status row missing', async () => {
      mockGetChapterStatusRow.mockResolvedValue(null);
      const res = mockRes();
      await handleGetChapterStatus(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('includes translation progress when translating', async () => {
      mockGetChapterStatusRow.mockResolvedValue({
        status: 'translating',
        updated_at: new Date().toISOString(),
      });
      mockGetTranslationProgress.mockReturnValue({ chunksDone: 2, totalChunks: 5 });
      const res = mockRes();
      await handleGetChapterStatus(mockReq() as never, res as never);
      assert.deepEqual(res.body, { status: 'translating', chunksDone: 2, totalChunks: 5 });
    });

    it('resets orphan translating chapter to pending', async () => {
      mockGetChapterStatusRow.mockResolvedValue({
        status: 'translating',
        updated_at: '2020-01-01T00:00:00.000Z',
      });
      mockGetTranslationProgress.mockReturnValue(undefined);
      mockUpdateChapter.mockResolvedValue(makeChapter({ status: 'pending' }));
      const res = mockRes();
      await handleGetChapterStatus(mockReq() as never, res as never);
      assert.deepEqual(res.body, { status: 'pending' });
      assert.equal(mockUpdateChapter.mock.calls.length, 1);
    });

    it('returns 500 on unexpected error', async () => {
      mockGetProject.mockRejectedValue(new Error('db down'));
      const res = mockRes();
      await handleGetChapterStatus(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });

    it('delegates to handleServiceError on infrastructure error', async () => {
      mockGetProject.mockRejectedValue(new Error('supabase'));
      mockHandleServiceError.mockReturnValue(true);
      const res = mockRes();
      await handleGetChapterStatus(mockReq() as never, res as never);
      assert.equal(mockHandleServiceError.mock.calls.length, 1);
    });
  });

  describe('handleGetChapter', () => {
    it('returns chapter when access verified', async () => {
      const chapter = makeChapter();
      mockGetChapter.mockResolvedValue(chapter);
      const res = mockRes();
      await handleGetChapter(mockReq() as never, res as never);
      assert.deepEqual(res.body, chapter);
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetChapter(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when access denied', async () => {
      mockVerifyChapterAccess.mockResolvedValue(false);
      const res = mockRes();
      await handleGetChapter(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 404 when chapter missing', async () => {
      mockGetChapter.mockResolvedValue(null);
      const res = mockRes();
      await handleGetChapter(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 500 on unexpected error', async () => {
      mockVerifyChapterAccess.mockRejectedValue(new Error('fail'));
      const res = mockRes();
      await handleGetChapter(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleDeleteChapter', () => {
    it('deletes chapter and invalidates cache', async () => {
      mockDeleteChapter.mockResolvedValue(true);
      const res = mockRes();
      await handleDeleteChapter(mockReq() as never, res as never);
      assert.deepEqual(res.body, { success: true });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleDeleteChapter(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when access denied', async () => {
      mockVerifyChapterAccess.mockResolvedValue(false);
      const res = mockRes();
      await handleDeleteChapter(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 404 when delete fails', async () => {
      mockDeleteChapter.mockResolvedValue(false);
      const res = mockRes();
      await handleDeleteChapter(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('uses respondRouteError on unexpected error', async () => {
      mockDeleteChapter.mockRejectedValue(new Error('delete failed'));
      const res = mockRes();
      await handleDeleteChapter(mockReq() as never, res as never);
      assert.equal(mockRespondRouteError.mock.calls.length, 1);
    });
  });

  describe('handleDuplicateChapters', () => {
    it('duplicates chapters and returns result', async () => {
      mockDuplicateChaptersInProject.mockResolvedValue({ duplicated: 2, chapterIds: ['ch-2'] });
      const res = mockRes();
      await handleDuplicateChapters(
        mockReq({ body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { duplicated: 2, chapterIds: ['ch-2'] });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleDuplicateChapters(
        mockReq({ user: undefined, body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleDuplicateChapters(mockReq({ body: {} }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when project missing', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleDuplicateChapters(
        mockReq({ body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 400 for INVALID_CHAPTER_IDS', async () => {
      const err = Object.assign(new Error('bad ids'), { code: 'INVALID_CHAPTER_IDS' });
      mockDuplicateChaptersInProject.mockRejectedValue(err);
      const res = mockRes();
      await handleDuplicateChapters(
        mockReq({ body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { code: string }).code, 'INVALID_CHAPTER_IDS');
    });

    it('returns 500 for TRANSFER_INCOMPLETE', async () => {
      const err = Object.assign(new Error('incomplete'), {
        code: 'TRANSFER_INCOMPLETE',
        expected: 2,
        actual: 1,
      });
      mockDuplicateChaptersInProject.mockRejectedValue(err);
      const res = mockRes();
      await handleDuplicateChapters(
        mockReq({ body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 500);
      assert.equal((res.body as { code: string }).code, 'TRANSFER_INCOMPLETE');
    });
  });

  describe('handleBulkDeleteChapters', () => {
    it('returns deleted count on success', async () => {
      mockBulkDeleteChapters.mockResolvedValue(2);
      const res = mockRes();
      await handleBulkDeleteChapters(
        mockReq({ body: { chapterIds: ['ch-1', 'ch-2'] } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { deleted: 2 });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleBulkDeleteChapters(
        mockReq({ user: undefined, body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleBulkDeleteChapters(mockReq({ body: {} }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when project missing', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleBulkDeleteChapters(
        mockReq({ body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 400 for INVALID_CHAPTER_IDS', async () => {
      const err = Object.assign(new Error('bad ids'), { code: 'INVALID_CHAPTER_IDS' });
      mockBulkDeleteChapters.mockRejectedValue(err);
      const res = mockRes();
      await handleBulkDeleteChapters(
        mockReq({ body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('uses respondRouteError on unexpected error', async () => {
      mockBulkDeleteChapters.mockRejectedValue(new Error('bulk fail'));
      const res = mockRes();
      await handleBulkDeleteChapters(
        mockReq({ body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(mockRespondRouteError.mock.calls.length, 1);
    });
  });

  describe('handleCancelTranslation', () => {
    it('cancels active translation', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ status: 'translating' }));
      mockUpdateChapter.mockResolvedValue(makeChapter({ status: 'pending' }));
      const res = mockRes();
      await handleCancelTranslation(mockReq() as never, res as never);
      assert.deepEqual(res.body, { success: true, message: 'Translation cancelled' });
    });

    it('returns false when chapter is not translating', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ status: 'pending' }));
      const res = mockRes();
      await handleCancelTranslation(mockReq() as never, res as never);
      assert.deepEqual(res.body, { success: false, message: 'Chapter is not being translated' });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleCancelTranslation(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when project missing', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleCancelTranslation(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 404 when chapter missing', async () => {
      mockGetChapter.mockResolvedValue(null);
      const res = mockRes();
      await handleCancelTranslation(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 500 on unexpected error', async () => {
      mockGetChapter.mockRejectedValue(new Error('fail'));
      const res = mockRes();
      await handleCancelTranslation(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleSyncTranslation', () => {
    it('syncs translated chunks to paragraphs', async () => {
      const paragraphs = [{ id: 'p-1', index: 0, originalText: 'Hi', translatedText: '' }];
      const synced = [{ id: 'p-1', index: 0, originalText: 'Hi', translatedText: 'Привет' }];
      mockGetChapter.mockResolvedValue(
        makeChapter({
          translatedChunks: ['Привет'],
          paragraphs,
        })
      );
      mockSyncTranslationChunksToParagraphs.mockReturnValue(synced);
      mockUpdateChapter.mockResolvedValue(makeChapter());
      const res = mockRes();
      await handleSyncTranslation(mockReq() as never, res as never);
      assert.equal((res.body as { success: boolean }).success, true);
      assert.equal((res.body as { syncedParagraphs: number }).syncedParagraphs, 1);
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleSyncTranslation(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 when no translated chunks', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ translatedChunks: [] }));
      const res = mockRes();
      await handleSyncTranslation(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 400 when no paragraphs', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ translatedChunks: ['x'], paragraphs: [] }));
      const res = mockRes();
      await handleSyncTranslation(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 500 on unexpected error', async () => {
      mockGetChapter.mockRejectedValue(new Error('sync fail'));
      const res = mockRes();
      await handleSyncTranslation(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleUploadTranslation', () => {
    it('uploads translation text and returns updated chapter', async () => {
      const synced = [{ id: 'p-1', index: 0, originalText: 'Hi', translatedText: 'Привет' }];
      mockGetChapter.mockResolvedValue(makeChapter());
      mockSyncTranslationToParagraphs.mockReturnValue(synced);
      mockMergeParagraphsToText.mockReturnValue('Привет');
      mockUpdateChapter.mockResolvedValue(makeChapter({ status: 'completed' }));
      const res = mockRes();
      await handleUploadTranslation(
        mockReq({ body: { translatedText: 'Привет' } }) as never,
        res as never
      );
      assert.equal((res.body as { status: string }).status, 'completed');
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleUploadTranslation(
        mockReq({ user: undefined, body: { translatedText: 'x' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 when translation in progress', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ status: 'translating' }));
      const res = mockRes();
      await handleUploadTranslation(
        mockReq({ body: { translatedText: 'x' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 400 when translation text empty', async () => {
      mockGetChapter.mockResolvedValue(makeChapter());
      const res = mockRes();
      await handleUploadTranslation(
        mockReq({ body: { translatedText: '  ' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 500 when updateChapter returns null', async () => {
      mockGetChapter.mockResolvedValue(makeChapter());
      mockSyncTranslationToParagraphs.mockReturnValue(makeChapter().paragraphs);
      mockUpdateChapter.mockResolvedValue(null);
      const res = mockRes();
      await handleUploadTranslation(
        mockReq({ body: { translatedText: 'text' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleMarkAsTranslated', () => {
    it('marks chapter as translated', async () => {
      mockGetChapter.mockResolvedValue(makeChapter());
      mockMergeParagraphsToText.mockReturnValue('Hello');
      mockUpdateChapter.mockResolvedValue(makeChapter({ status: 'completed' }));
      const res = mockRes();
      await handleMarkAsTranslated(mockReq() as never, res as never);
      assert.equal((res.body as { status: string }).status, 'completed');
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleMarkAsTranslated(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 when translation in progress', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ status: 'translating' }));
      const res = mockRes();
      await handleMarkAsTranslated(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 400 when no paragraphs', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ paragraphs: [] }));
      const res = mockRes();
      await handleMarkAsTranslated(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 500 when update fails', async () => {
      mockGetChapter.mockResolvedValue(makeChapter());
      mockUpdateChapter.mockResolvedValue(null);
      const res = mockRes();
      await handleMarkAsTranslated(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleMarkAsTranslatedBatch', () => {
    it('returns batch aggregate result', async () => {
      mockMarkChaptersAsTranslatedBatch.mockResolvedValue({
        summary: { total: 1, processed: 1, success: 1, failed: 0, skipped: 0 },
        results: [{ chapterId: 'ch-1', status: 'success' }],
      });
      const res = mockRes();
      await handleMarkAsTranslatedBatch(
        mockReq({ body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal((res.body as { summary: { success: number } }).summary.success, 1);
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleMarkAsTranslatedBatch(
        mockReq({ user: undefined, body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleMarkAsTranslatedBatch(mockReq({ body: {} }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when project missing', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleMarkAsTranslatedBatch(
        mockReq({ body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 500 on unexpected error', async () => {
      mockMarkChaptersAsTranslatedBatch.mockRejectedValue(new Error('batch fail'));
      const res = mockRes();
      await handleMarkAsTranslatedBatch(
        mockReq({ body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 500);
    });
  });

  describe('createHandleAnalyzeBatch', () => {
    it('runs sync analysis batch successfully', async () => {
      mockGetChapter.mockResolvedValue(makeChapter());
      mockAnalyzeChaptersBatch.mockResolvedValue({
        chapterResults: [
          { chapterId: 'ch-1', success: true, chapterNumber: 1, glossaryAppearanceEntryIds: [] },
        ],
        glossaryUpdates: [],
        glossaryUpdatesExisting: [],
        totalTokensUsed: 100,
        totalDuration: 50,
      });
      const handler = createHandleAnalyzeBatch(makeDeps());
      const res = mockRes();
      await handler(mockReq({ body: { chapterIds: ['ch-1'] } }) as never, res as never);
      assert.equal((res.body as { success: boolean }).success, true);
    });

    it('returns 401 when user missing', async () => {
      const handler = createHandleAnalyzeBatch(makeDeps());
      const res = mockRes();
      await handler(
        mockReq({ user: undefined, body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 when no chapters with text', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ originalText: '' }));
      mockResolveEffectiveOriginalText.mockReturnValue('');
      const handler = createHandleAnalyzeBatch(makeDeps());
      const res = mockRes();
      await handler(mockReq({ body: { chapterIds: ['ch-1'] } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 429 when token limit exceeded', async () => {
      mockGetChapter.mockResolvedValue(makeChapter());
      mockCheckTokenLimit.mockResolvedValue({
        allowed: false,
        currentUsage: 99_000,
        limit: 100_000,
      });
      const handler = createHandleAnalyzeBatch(makeDeps());
      const res = mockRes();
      await handler(mockReq({ body: { chapterIds: ['ch-1'] } }) as never, res as never);
      assert.equal(res.statusCode, 429);
    });

    it('enqueues async analysis job when prefer async', async () => {
      mockIsPreferAsync.mockReturnValue(true);
      mockIsBullAvailable.mockReturnValue(true);
      mockAnalysisJobStore.hasActiveJobForUser.mockResolvedValue(false);
      mockGetChapter.mockResolvedValue(makeChapter());
      const handler = createHandleAnalyzeBatch(makeDeps());
      const res = mockRes();
      await handler(
        mockReq({ body: { chapterIds: ['ch-1'] }, query: { async: '1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 202);
      assert.equal((res.body as { jobId: string }).jobId, 'analysis-job-1');
    });

    it('returns 503 when async requested but bull unavailable', async () => {
      mockIsPreferAsync.mockReturnValue(true);
      mockIsBullAvailable.mockReturnValue(false);
      mockGetChapter.mockResolvedValue(makeChapter());
      const handler = createHandleAnalyzeBatch(makeDeps());
      const res = mockRes();
      await handler(
        mockReq({ body: { chapterIds: ['ch-1'] }, query: { async: '1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 503);
    });

    it('returns 409 when user already has active analysis job', async () => {
      mockIsPreferAsync.mockReturnValue(true);
      mockIsBullAvailable.mockReturnValue(true);
      mockAnalysisJobStore.hasActiveJobForUser.mockResolvedValue(true);
      mockGetChapter.mockResolvedValue(makeChapter());
      const handler = createHandleAnalyzeBatch(makeDeps());
      const res = mockRes();
      await handler(
        mockReq({ body: { chapterIds: ['ch-1'] }, query: { async: '1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 409);
    });

    it('returns 500 on unexpected error', async () => {
      mockGetProject.mockRejectedValue(new Error('analyze fail'));
      const handler = createHandleAnalyzeBatch(makeDeps());
      const res = mockRes();
      await handler(mockReq({ body: { chapterIds: ['ch-1'] } }) as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('createHandleListProjectJobs', () => {
    it('returns merged analysis and translate jobs for user', async () => {
      mockAnalysisJobStore.listByProject.mockResolvedValue([
        {
          jobId: 'a1',
          userId: 'user-1',
          projectId: 'proj-1',
          startedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      mockTranslateJobStore.listByProject.mockResolvedValue([
        {
          jobId: 't1',
          userId: 'user-1',
          projectId: 'proj-1',
          startedAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
      const handler = createHandleListProjectJobs(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      const body = res.body as { jobs: Array<{ type: string; jobId: string }> };
      assert.equal(body.jobs.length, 2);
      assert.equal(body.jobs[0]?.type, 'analysis');
      assert.equal(body.jobs[1]?.type, 'translate');
    });

    it('returns 401 when user missing', async () => {
      const handler = createHandleListProjectJobs(makeDeps());
      const res = mockRes();
      await handler(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when project missing', async () => {
      mockGetProject.mockResolvedValue(null);
      const handler = createHandleListProjectJobs(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('createHandleGetAnalysisJobStatus', () => {
    it('returns public analysis job for owner', async () => {
      mockAnalysisJobStore.getJob.mockResolvedValue(makeAnalysisJob());
      const handler = createHandleGetAnalysisJobStatus(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal((res.body as { public: boolean }).public, true);
    });

    it('returns 401 when user missing', async () => {
      const handler = createHandleGetAnalysisJobStatus(makeDeps());
      const res = mockRes();
      await handler(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when job not found', async () => {
      mockAnalysisJobStore.getJob.mockResolvedValue(null);
      const handler = createHandleGetAnalysisJobStatus(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 404 for foreign job', async () => {
      mockAnalysisJobStore.getJob.mockResolvedValue(makeAnalysisJob({ userId: 'other-user' }));
      const handler = createHandleGetAnalysisJobStatus(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('createHandleCancelAnalysisJob', () => {
    it('cancels running analysis job', async () => {
      mockAnalysisJobStore.getJob.mockResolvedValue(makeAnalysisJob({ status: 'running' }));
      const handler = createHandleCancelAnalysisJob(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.deepEqual(res.body, { success: true });
      assert.equal(mockAnalysisJobStore.requestCancel.mock.calls.length, 1);
    });

    it('returns success for already completed job', async () => {
      mockAnalysisJobStore.getJob.mockResolvedValue(makeAnalysisJob({ status: 'completed' }));
      const handler = createHandleCancelAnalysisJob(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.deepEqual(res.body, { success: true });
    });

    it('returns 401 when user missing', async () => {
      const handler = createHandleCancelAnalysisJob(makeDeps());
      const res = mockRes();
      await handler(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when job not found', async () => {
      mockAnalysisJobStore.getJob.mockResolvedValue(null);
      const handler = createHandleCancelAnalysisJob(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 500 on unexpected error', async () => {
      mockAnalysisJobStore.getJob.mockRejectedValue(new Error('cancel fail'));
      const handler = createHandleCancelAnalysisJob(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('createHandleTranslateBatch', () => {
    it('returns 400 when sync batch translate requested', async () => {
      mockGetChapter.mockResolvedValue(makeChapter());
      const handler = createHandleTranslateBatch(makeDeps());
      const res = mockRes();
      await handler(mockReq({ body: { chapterIds: ['ch-1'] } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('enqueues async translate job', async () => {
      mockIsPreferAsync.mockReturnValue(true);
      mockIsBullAvailable.mockReturnValue(true);
      mockTranslateJobStore.hasActiveJobForUser.mockResolvedValue(false);
      mockGetChapter.mockResolvedValue(makeChapter());
      const handler = createHandleTranslateBatch(makeDeps());
      const res = mockRes();
      await handler(
        mockReq({ body: { chapterIds: ['ch-1'] }, query: { async: '1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 202);
    });

    it('returns 401 when user missing', async () => {
      const handler = createHandleTranslateBatch(makeDeps());
      const res = mockRes();
      await handler(
        mockReq({ user: undefined, body: { chapterIds: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 when no chapters to translate', async () => {
      mockResolveEffectiveOriginalText.mockReturnValue('');
      mockGetChapter.mockResolvedValue(makeChapter({ originalText: '' }));
      const handler = createHandleTranslateBatch(makeDeps());
      const res = mockRes();
      await handler(mockReq({ body: { chapterIds: ['ch-1'] } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 429 when token limit exceeded', async () => {
      mockIsPreferAsync.mockReturnValue(true);
      mockGetChapter.mockResolvedValue(makeChapter());
      mockCheckTokenLimit.mockResolvedValue({
        allowed: false,
        currentUsage: 99_000,
        limit: 100_000,
      });
      const handler = createHandleTranslateBatch(makeDeps());
      const res = mockRes();
      await handler(
        mockReq({ body: { chapterIds: ['ch-1'] }, query: { async: '1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 429);
    });

    it('returns 500 on unexpected error', async () => {
      mockGetProject.mockRejectedValue(new Error('translate batch fail'));
      const handler = createHandleTranslateBatch(makeDeps());
      const res = mockRes();
      await handler(mockReq({ body: { chapterIds: ['ch-1'] } }) as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('createHandleGetTranslateJobStatus', () => {
    it('returns public translate job for owner', async () => {
      mockTranslateJobStore.getJob.mockResolvedValue(makeTranslateJob());
      const handler = createHandleGetTranslateJobStatus(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal((res.body as { public: boolean }).public, true);
    });

    it('returns 401 when user missing', async () => {
      const handler = createHandleGetTranslateJobStatus(makeDeps());
      const res = mockRes();
      await handler(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when job not found', async () => {
      mockTranslateJobStore.getJob.mockResolvedValue(null);
      const handler = createHandleGetTranslateJobStatus(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 404 for foreign job', async () => {
      mockTranslateJobStore.getJob.mockResolvedValue(makeTranslateJob({ userId: 'other' }));
      const handler = createHandleGetTranslateJobStatus(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('createHandleCancelTranslateJob', () => {
    it('cancels running translate job', async () => {
      mockTranslateJobStore.getJob.mockResolvedValue(makeTranslateJob({ status: 'running' }));
      const handler = createHandleCancelTranslateJob(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.deepEqual(res.body, { success: true });
    });

    it('returns success for completed job', async () => {
      mockTranslateJobStore.getJob.mockResolvedValue(makeTranslateJob({ status: 'completed' }));
      const handler = createHandleCancelTranslateJob(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.deepEqual(res.body, { success: true });
    });

    it('returns 401 when user missing', async () => {
      const handler = createHandleCancelTranslateJob(makeDeps());
      const res = mockRes();
      await handler(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when job not found', async () => {
      mockTranslateJobStore.getJob.mockResolvedValue(null);
      const handler = createHandleCancelTranslateJob(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 500 on unexpected error', async () => {
      mockTranslateJobStore.getJob.mockRejectedValue(new Error('cancel fail'));
      const handler = createHandleCancelTranslateJob(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('createHandleTranslateChapter', () => {
    it('starts translation when chapter is ready', async () => {
      mockGetChapter.mockResolvedValue(makeChapter());
      mockUpdateChapter.mockResolvedValue(makeChapter({ status: 'translating' }));
      const handler = createHandleTranslateChapter(makeDeps());
      const res = mockRes();
      await handler(mockReq({ body: {} }) as never, res as never);
      assert.equal((res.body as { status: string }).status, 'started');
      assert.equal(mockPerformTranslation.mock.calls.length, 1);
    });

    it('returns 409 when translation already running', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ status: 'translating' }));
      const handler = createHandleTranslateChapter(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 409);
      assert.equal((res.body as { code: string }).code, 'ALREADY_RUNNING');
    });

    it('returns 401 when user missing', async () => {
      const handler = createHandleTranslateChapter(makeDeps());
      const res = mockRes();
      await handler(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 when no source text', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ originalText: '' }));
      mockResolveEffectiveOriginalText.mockReturnValue('');
      const handler = createHandleTranslateChapter(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 429 when token limit exceeded', async () => {
      mockGetChapter.mockResolvedValue(makeChapter());
      mockCheckTokenLimit.mockResolvedValue({
        allowed: false,
        currentUsage: 99_000,
        limit: 100_000,
      });
      mockUpdateChapter.mockResolvedValue(makeChapter({ status: 'pending' }));
      const handler = createHandleTranslateChapter(makeDeps());
      const res = mockRes();
      await handler(mockReq({ body: {} }) as never, res as never);
      assert.equal(res.statusCode, 429);
    });

    it('returns 500 on unexpected error', async () => {
      mockGetChapter.mockRejectedValue(new Error('translate fail'));
      const handler = createHandleTranslateChapter(makeDeps());
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleChapterCritic', () => {
    it('returns cached critic report when fingerprint matches', async () => {
      const report = { contentFingerprint: 'fp-1', tokensUsed: 0, issues: [] };
      mockGetChapter.mockResolvedValue(
        makeChapter({
          status: 'completed',
          criticReport: report,
          paragraphs: [{ id: 'p-1', index: 0, originalText: 'Hi', translatedText: 'Привет' }],
        })
      );
      const res = mockRes();
      await handleChapterCritic(mockReq({ body: {} }) as never, res as never);
      assert.deepEqual(res.body, { report, cached: true });
    });

    it('runs critic and returns fresh report', async () => {
      mockGetChapter.mockResolvedValue(
        makeChapter({
          status: 'completed',
          paragraphs: [{ id: 'p-1', index: 0, originalText: 'Hi', translatedText: 'Привет' }],
        })
      );
      mockRunChapterCritic.mockResolvedValue({
        contentFingerprint: 'fp-2',
        tokensUsed: 50,
        issues: [],
      });
      mockUpdateChapter.mockResolvedValue(makeChapter());
      const res = mockRes();
      await handleChapterCritic(mockReq({ body: { force: true } }) as never, res as never);
      assert.equal((res.body as { cached: boolean }).cached, false);
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleChapterCritic(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 409 when translation in progress', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ status: 'translating' }));
      const res = mockRes();
      await handleChapterCritic(mockReq() as never, res as never);
      assert.equal(res.statusCode, 409);
    });

    it('returns 400 when input too large', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ status: 'completed' }));
      mockComputeCriticInputStats.mockReturnValue({
        tooLarge: true,
        totalChars: 100_000,
        maxInputChars: 50_000,
      });
      const res = mockRes();
      await handleChapterCritic(mockReq({ body: { force: true } }) as never, res as never);
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { code: string }).code, 'CRITIC_INPUT_TOO_LARGE');
    });

    it('returns 429 when token limit exceeded', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ status: 'completed' }));
      mockCheckTokenLimit.mockResolvedValue({
        allowed: false,
        currentUsage: 99_000,
        limit: 100_000,
      });
      const res = mockRes();
      await handleChapterCritic(mockReq({ body: { force: true } }) as never, res as never);
      assert.equal(res.statusCode, 429);
    });

    it('returns 500 on unexpected error', async () => {
      mockGetChapter.mockRejectedValue(new Error('critic fail'));
      const res = mockRes();
      await handleChapterCritic(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleGetChapterStats', () => {
    it('returns chapter stats', async () => {
      mockGetChapter.mockResolvedValue(makeChapter());
      mockGetChapterStats.mockReturnValue({ wordCount: 42 });
      const res = mockRes();
      await handleGetChapterStats(mockReq() as never, res as never);
      assert.deepEqual(res.body, { wordCount: 42 });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetChapterStats(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when chapter missing', async () => {
      mockGetChapter.mockResolvedValue(null);
      const res = mockRes();
      await handleGetChapterStats(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 500 on unexpected error', async () => {
      mockGetChapter.mockRejectedValue(new Error('stats fail'));
      const res = mockRes();
      await handleGetChapterStats(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleUpdateChapterTitle', () => {
    it('updates title for untranslated chapter', async () => {
      mockGetChapter.mockResolvedValue(makeChapter({ status: 'pending' }));
      mockUpdateChapter.mockResolvedValue(makeChapter({ title: 'New Title' }));
      const res = mockRes();
      await handleUpdateChapterTitle(
        mockReq({ body: { title: 'New Title' } }) as never,
        res as never
      );
      assert.equal((res.body as { title: string }).title, 'New Title');
    });

    it('updates translatedTitle when chapter has translation', async () => {
      mockGetChapter.mockResolvedValue(
        makeChapter({ status: 'completed', translatedText: 'text' })
      );
      mockUpdateChapter.mockResolvedValue(makeChapter({ translatedTitle: 'New' }));
      const res = mockRes();
      await handleUpdateChapterTitle(mockReq({ body: { title: 'New' } }) as never, res as never);
      const updateArg = mockUpdateChapter.mock.calls[0]?.[2] as { translatedTitle?: string };
      assert.equal(updateArg.translatedTitle, 'New');
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleUpdateChapterTitle(
        mockReq({ user: undefined, body: { title: 'x' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 when title validation fails', async () => {
      const res = mockRes();
      await handleUpdateChapterTitle(mockReq({ body: { title: '' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when chapter missing', async () => {
      mockGetChapter.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateChapterTitle(mockReq({ body: { title: 'New' } }) as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleUpdateChapterNumber', () => {
    it('updates chapter number and returns project', async () => {
      mockUpdateChapterNumber.mockResolvedValue(makeChapter({ number: 2 }));
      mockGetProject.mockResolvedValue({ id: 'proj-1', name: 'Test' });
      const res = mockRes();
      await handleUpdateChapterNumber(mockReq({ body: { number: 2 } }) as never, res as never);
      assert.equal((res.body as { id: string }).id, 'proj-1');
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleUpdateChapterNumber(
        mockReq({ user: undefined, body: { number: 2 } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleUpdateChapterNumber(mockReq({ body: { number: 0 } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when chapter missing', async () => {
      mockUpdateChapterNumber.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateChapterNumber(mockReq({ body: { number: 2 } }) as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 500 on unexpected error', async () => {
      mockUpdateChapterNumber.mockRejectedValue(new Error('number fail'));
      const res = mockRes();
      await handleUpdateChapterNumber(mockReq({ body: { number: 2 } }) as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleUpdateChapterStatus', () => {
    it('updates status via readerProgress domain', async () => {
      mockUpdateChapterStatus.mockResolvedValue(makeChapter({ status: 'completed' }));
      const res = mockRes();
      await handleUpdateChapterStatus(
        mockReq({ body: { status: 'completed' } }) as never,
        res as never
      );
      assert.equal((res.body as { status: string }).status, 'completed');
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleUpdateChapterStatus(
        mockReq({ user: undefined, body: { status: 'completed' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleUpdateChapterStatus(
        mockReq({ body: { status: 'invalid' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when chapter missing', async () => {
      mockUpdateChapterStatus.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateChapterStatus(
        mockReq({ body: { status: 'completed' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 500 on unexpected error', async () => {
      mockUpdateChapterStatus.mockRejectedValue(new Error('status fail'));
      const res = mockRes();
      await handleUpdateChapterStatus(
        mockReq({ body: { status: 'completed' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleUpdateChaptersOrder', () => {
    it('reorders chapters and returns project', async () => {
      mockUpdateChaptersOrder.mockResolvedValue(undefined);
      mockGetProject.mockResolvedValue({ id: 'proj-1', name: 'Test' });
      const res = mockRes();
      await handleUpdateChaptersOrder(
        mockReq({ body: { ids: ['ch-2', 'ch-1'] } }) as never,
        res as never
      );
      assert.equal((res.body as { id: string }).id, 'proj-1');
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleUpdateChaptersOrder(
        mockReq({ user: undefined, body: { ids: ['ch-1'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleUpdateChaptersOrder(mockReq({ body: {} }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 500 on unexpected error', async () => {
      mockUpdateChaptersOrder.mockRejectedValue(new Error('order fail'));
      const res = mockRes();
      await handleUpdateChaptersOrder(mockReq({ body: { ids: ['ch-1'] } }) as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleUpdateParagraph', () => {
    it('updates paragraph text', async () => {
      mockUpdateParagraph.mockResolvedValue({
        id: 'p-1',
        translatedText: 'Привет',
        status: 'translated',
      });
      const res = mockRes();
      await handleUpdateParagraph(
        mockReq({ body: { translatedText: 'Привет' } }) as never,
        res as never
      );
      assert.equal((res.body as { translatedText: string }).translatedText, 'Привет');
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleUpdateParagraph(
        mockReq({ body: { status: 'invalid-status' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when paragraph not found', async () => {
      mockUpdateParagraph.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateParagraph(
        mockReq({ body: { translatedText: 'x' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 500 on unexpected error', async () => {
      mockUpdateParagraph.mockRejectedValue(new Error('paragraph fail'));
      const res = mockRes();
      await handleUpdateParagraph(
        mockReq({ body: { translatedText: 'x' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 500);
    });
  });
});
