import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const {
  mockGetAllProjectsLightweight,
  mockGetProject,
  mockCreateProject,
  mockCreateProjectFromCatalogRequest,
  mockDeleteProject,
  mockUpdateProject,
  mockUpdateReaderSettings,
  mockResetStuckChapters,
  mockInvalidateUserProjectCaches,
  mockInvalidateProjectAndRelatedCaches,
  mockHandleServiceError,
  mockCloneProject,
  mockTransferChaptersFromProject,
  mockGetChaptersSummary,
  mockGetReaderSettings,
  mockSearchParagraphsInProject,
  mockBulkUpdateParagraphs,
  mockLoadParagraphsForAiReplace,
  mockClearAgentCache,
  mockInvalidateAnalysisForProject,
  mockIsProjectLanguagePairLocked,
  mockCheckTokenLimit,
  mockIncrementTokenUsage,
  mockRunProjectAiReplace,
  AiReplaceTooManyError,
} = vi.hoisted(() => {
  class AiReplaceTooManyError extends Error {
    readonly code = 'AI_REPLACE_TOO_MANY';
    constructor(message = 'Too many paragraphs') {
      super(message);
      this.name = 'AiReplaceTooManyError';
    }
  }
  return {
    mockGetAllProjectsLightweight: vi.fn(),
    mockGetProject: vi.fn(),
    mockCreateProject: vi.fn(),
    mockCreateProjectFromCatalogRequest: vi.fn(),
    mockDeleteProject: vi.fn(),
    mockUpdateProject: vi.fn(),
    mockUpdateReaderSettings: vi.fn(),
    mockResetStuckChapters: vi.fn(),
    mockInvalidateUserProjectCaches: vi.fn(),
    mockInvalidateProjectAndRelatedCaches: vi.fn(),
    mockHandleServiceError: vi.fn(() => false),
    mockCloneProject: vi.fn(),
    mockTransferChaptersFromProject: vi.fn(),
    mockGetChaptersSummary: vi.fn(),
    mockGetReaderSettings: vi.fn(),
    mockSearchParagraphsInProject: vi.fn(),
    mockBulkUpdateParagraphs: vi.fn(),
    mockLoadParagraphsForAiReplace: vi.fn(),
    mockClearAgentCache: vi.fn(),
    mockInvalidateAnalysisForProject: vi.fn(),
    mockIsProjectLanguagePairLocked: vi.fn(),
    mockCheckTokenLimit: vi.fn(),
    mockIncrementTokenUsage: vi.fn(),
    mockRunProjectAiReplace: vi.fn(),
    AiReplaceTooManyError,
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
  getAllProjectsLightweight: mockGetAllProjectsLightweight,
  getProject: mockGetProject,
  createProject: mockCreateProject,
  cloneProject: mockCloneProject,
  transferChaptersFromProject: mockTransferChaptersFromProject,
  updateProject: mockUpdateProject,
  deleteProject: mockDeleteProject,
  getChaptersSummary: mockGetChaptersSummary,
  updateReaderSettings: mockUpdateReaderSettings,
  getReaderSettings: mockGetReaderSettings,
  resetStuckChapters: mockResetStuckChapters,
}));

vi.mock('../../../services/supabase/domains/catalogBoard.js', () => ({
  createProjectFromCatalogRequest: (...args: unknown[]) =>
    mockCreateProjectFromCatalogRequest(...args),
}));

vi.mock('../../../services/supabase/domains/paragraphs.js', () => ({
  searchParagraphsInProject: mockSearchParagraphsInProject,
  bulkUpdateParagraphs: mockBulkUpdateParagraphs,
  loadParagraphsForAiReplace: mockLoadParagraphsForAiReplace,
}));

vi.mock('../../../middleware/serviceHealth.js', () => ({
  handleServiceError: mockHandleServiceError,
}));

vi.mock('../../../middleware/tokenLimits.js', () => ({
  checkTokenLimit: mockCheckTokenLimit,
  incrementTokenUsage: mockIncrementTokenUsage,
}));

vi.mock('../../../services/engine-integration.js', () => ({
  clearAgentCache: mockClearAgentCache,
}));

vi.mock('../../../services/analysisCache.js', () => ({
  invalidateAnalysisForProject: mockInvalidateAnalysisForProject,
}));

vi.mock('../../../services/projectLanguagePair.js', () => ({
  isProjectLanguagePairLocked: mockIsProjectLanguagePairLocked,
}));

vi.mock('../../../services/cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches: (...args: unknown[]) =>
    mockInvalidateProjectAndRelatedCaches(...args),
}));

vi.mock('../../routeHelpers.js', () => ({
  invalidateUserProjectCaches: mockInvalidateUserProjectCaches,
}));

vi.mock('../../../services/project-ai-replace.js', () => ({
  runProjectAiReplace: mockRunProjectAiReplace,
  AiReplaceTooManyError,
  AiReplaceInputTooLargeError: class AiReplaceInputTooLargeError extends Error {
    readonly code = 'AI_REPLACE_INPUT_TOO_LARGE';
  },
  AiReplaceNoChangesError: class AiReplaceNoChangesError extends Error {
    readonly code = 'AI_REPLACE_NO_CHANGES';
  },
  AiReplaceOutputInvalidError: class AiReplaceOutputInvalidError extends Error {
    readonly code = 'AI_REPLACE_OUTPUT_INVALID';
    reason = 'invalid';
    paragraphId = 'p1';
    beforeLen = 10;
    afterLen = 20;
    changeRatio = 2;
  },
}));

vi.mock('../../../shared/aiReplacePresets.js', () => ({
  sanitizeAiReplaceDetail: (detail: unknown) => detail,
}));

vi.mock('../../../shared/aiReplaceEstimate.js', () => ({
  estimateAiReplaceTokens: () => 50,
}));

import {
  handleBulkUpdateParagraphs,
  handleCloneProject,
  handleCreateProject,
  handleDeleteProject,
  handleGetChaptersSummary,
  handleGetProject,
  handleGetReaderSettings,
  handleListProjects,
  handleProjectAiReplace,
  handleRenameProject,
  handleSearchProject,
  handleTransferChapters,
  handleUpdateProjectLanguages,
  handleUpdateProjectSettings,
  handleUpdateReaderSettings,
} from './projectRouteHandlers.js';

function makeProjectLimitError(limit: number, current: number) {
  const err = new Error('Project limit reached') as Error & {
    code: string;
    limit: number;
    current: number;
  };
  err.code = 'PROJECT_LIMIT';
  err.limit = limit;
  err.current = current;
  return err;
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    name: 'Test',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    settings: {
      temperature: 0.7,
      enableAnalysis: true,
      enableTranslation: true,
      enableEditing: true,
      reader: { fontFamily: 'serif', fontSize: 16, colorScheme: 'light' },
    },
    ...overrides,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', role: 'author' as const },
    token: 'bearer-token',
    params: { id: 'proj-1' },
    body: {},
    query: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
}

describe('projectRouteHandlers', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockHandleServiceError.mockReturnValue(false);
    mockIsProjectLanguagePairLocked.mockReturnValue(false);
    mockCheckTokenLimit.mockResolvedValue({ allowed: true, currentUsage: 0, limit: 1000 });
    mockIncrementTokenUsage.mockResolvedValue(undefined);
  });

  describe('handleListProjects', () => {
    it('returns project list on success', async () => {
      mockResetStuckChapters.mockResolvedValue(0);
      mockGetAllProjectsLightweight.mockResolvedValue([{ id: 'proj-1', name: 'Test' }]);
      const res = mockRes();
      await handleListProjects(mockReq() as never, res as never);
      assert.deepEqual(res.body, [{ id: 'proj-1', name: 'Test' }]);
      assert.equal(mockResetStuckChapters.mock.calls[0]?.[0], 'bearer-token');
      assert.equal(mockGetAllProjectsLightweight.mock.calls[0]?.[0], 'user-1');
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleListProjects(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 500 on unexpected error', async () => {
      mockResetStuckChapters.mockResolvedValue(0);
      mockGetAllProjectsLightweight.mockRejectedValue(new Error('db down'));
      const res = mockRes();
      await handleListProjects(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Failed to get projects' });
    });
  });

  describe('handleCreateProject', () => {
    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleCreateProject(mockReq({ body: { name: '' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Validation failed');
    });

    it('creates project and invalidates cache on success', async () => {
      mockCreateProject.mockResolvedValue({ id: 'proj-new', name: 'My Novel' });
      mockInvalidateUserProjectCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleCreateProject(
        mockReq({
          body: { name: 'My Novel', sourceLanguage: 'en', targetLanguage: 'ru' },
        }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'proj-new', name: 'My Novel' });
      assert.equal(mockCreateProject.mock.calls.length, 1);
      assert.equal(mockInvalidateUserProjectCaches.mock.calls[0]?.[0], 'user-1');
    });

    it('returns 409 PROJECT_LIMIT when limit reached', async () => {
      mockCreateProject.mockRejectedValue(makeProjectLimitError(10, 10));
      const res = mockRes();
      await handleCreateProject(
        mockReq({
          body: { name: 'My Novel', sourceLanguage: 'en', targetLanguage: 'ru' },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 409);
      const body = res.body as { code: string; limit: number; current: number };
      assert.equal(body.code, 'PROJECT_LIMIT');
      assert.equal(body.limit, 10);
      assert.equal(body.current, 10);
    });
  });

  describe('handleCloneProject', () => {
    it('clones project and invalidates cache on success', async () => {
      mockCloneProject.mockResolvedValue({ id: 'proj-clone', name: 'Test (copy)' });
      mockInvalidateUserProjectCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleCloneProject(mockReq({ body: { name: 'Test (copy)' } }) as never, res as never);
      assert.deepEqual(res.body, { id: 'proj-clone', name: 'Test (copy)' });
      assert.equal(mockCloneProject.mock.calls[0]?.[0], 'proj-1');
      assert.equal(mockInvalidateUserProjectCaches.mock.calls[0]?.[0], 'user-1');
    });

    it('returns 404 when source project not found', async () => {
      mockCloneProject.mockResolvedValue(null);
      const res = mockRes();
      await handleCloneProject(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Project not found' });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleCloneProject(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleTransferChapters', () => {
    it('transfers chapters and invalidates caches on success', async () => {
      const result = { transferred: 2, chapterIds: ['ch-1', 'ch-2'] };
      mockTransferChaptersFromProject.mockResolvedValue(result);
      mockInvalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleTransferChapters(
        mockReq({
          params: { targetProjectId: 'proj-target' },
          body: {
            sourceProjectId: 'proj-source',
            chapterIds: ['ch-1', 'ch-2'],
            includeGlossary: true,
          },
        }) as never,
        res as never
      );
      assert.deepEqual(res.body, result);
      assert.equal(mockTransferChaptersFromProject.mock.calls[0]?.[0], 'proj-target');
      assert.equal(mockClearAgentCache.mock.calls[0]?.[0], 'proj-target');
      assert.equal(mockClearAgentCache.mock.calls[1]?.[0], 'proj-source');
    });

    it('returns 404 when target project not found', async () => {
      mockTransferChaptersFromProject.mockResolvedValue(null);
      const res = mockRes();
      await handleTransferChapters(
        mockReq({
          params: { targetProjectId: 'proj-target' },
          body: { sourceProjectId: 'proj-source', chapterIds: ['ch-1'] },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 400 when chapterIds empty', async () => {
      const res = mockRes();
      await handleTransferChapters(
        mockReq({
          params: { targetProjectId: 'proj-target' },
          body: { sourceProjectId: 'proj-source', chapterIds: [] },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 409 SAME_PROJECT when source equals target', async () => {
      const err = new Error('Cannot transfer to same project') as Error & { code: string };
      err.code = 'SAME_PROJECT';
      mockTransferChaptersFromProject.mockRejectedValue(err);
      const res = mockRes();
      await handleTransferChapters(
        mockReq({
          params: { targetProjectId: 'proj-target' },
          body: { sourceProjectId: 'proj-source', chapterIds: ['ch-1'] },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 409);
      assert.equal((res.body as { code: string }).code, 'SAME_PROJECT');
    });
  });

  describe('handleGetProject', () => {
    it('returns project when found', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1', name: 'Test' });
      const res = mockRes();
      await handleGetProject(mockReq() as never, res as never);
      assert.deepEqual(res.body, { id: 'proj-1', name: 'Test' });
    });

    it('returns 404 when project not found', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleGetProject(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Project not found' });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetProject(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleGetChaptersSummary', () => {
    it('returns chapters summary on success', async () => {
      const summary = [{ id: 'ch-1', title: 'Chapter 1', status: 'translated' }];
      mockGetChaptersSummary.mockResolvedValue(summary);
      const res = mockRes();
      await handleGetChaptersSummary(mockReq() as never, res as never);
      assert.deepEqual(res.body, summary);
      assert.equal(mockGetChaptersSummary.mock.calls[0]?.[0], 'proj-1');
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetChaptersSummary(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleSearchProject', () => {
    it('returns search results on success', async () => {
      mockGetProject.mockResolvedValue(makeProject());
      const searchResult = { items: [{ paragraphId: 'p-1', snippet: 'hero' }], total: 1 };
      mockSearchParagraphsInProject.mockResolvedValue(searchResult);
      const res = mockRes();
      await handleSearchProject(
        mockReq({ query: { q: 'hero', field: 'translated' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, searchResult);
      assert.equal(mockSearchParagraphsInProject.mock.calls[0]?.[0], 'proj-1');
      assert.equal(mockSearchParagraphsInProject.mock.calls[0]?.[1], 'hero');
    });

    it('returns 404 when project not found', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleSearchProject(mockReq({ query: { q: 'hero' } }) as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleSearchProject(
        mockReq({ user: undefined, query: { q: 'x' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleProjectAiReplace', () => {
    const aiReplaceBody = {
      find: 'hero',
      preset: 'minimal_fix' as const,
      paragraphs: [{ chapterId: 'ch-1', paragraphId: 'p-1' }],
    };

    it('runs AI replace and increments token usage on success', async () => {
      mockGetProject.mockResolvedValue(makeProject());
      mockLoadParagraphsForAiReplace.mockResolvedValue([
        { chapterId: 'ch-1', paragraphId: 'p-1', translatedText: 'The hero walked.' },
      ]);
      const replaceResult = {
        items: [],
        tokensUsed: 42,
        model: 'gpt-4.1-mini',
        batches: 1,
      };
      mockRunProjectAiReplace.mockResolvedValue(replaceResult);
      const res = mockRes();
      await handleProjectAiReplace(mockReq({ body: aiReplaceBody }) as never, res as never);
      assert.deepEqual(res.body, replaceResult);
      assert.equal(mockIncrementTokenUsage.mock.calls[0]?.[2], 42);
    });

    it('returns 404 when project not found', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleProjectAiReplace(mockReq({ body: aiReplaceBody }) as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 429 when token limit exceeded', async () => {
      mockGetProject.mockResolvedValue(makeProject());
      mockLoadParagraphsForAiReplace.mockResolvedValue([
        { chapterId: 'ch-1', paragraphId: 'p-1', translatedText: 'text' },
      ]);
      mockCheckTokenLimit.mockResolvedValue({
        allowed: false,
        currentUsage: 900,
        limit: 1000,
        message: 'Daily limit reached',
      });
      const res = mockRes();
      await handleProjectAiReplace(mockReq({ body: aiReplaceBody }) as never, res as never);
      assert.equal(res.statusCode, 429);
      assert.equal((res.body as { code: string }).code, 'AI_REPLACE_TOKEN_LIMIT');
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleProjectAiReplace(
        mockReq({ body: { find: '', preset: 'minimal_fix', paragraphs: [] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 400 when runProjectAiReplace throws AiReplaceTooManyError', async () => {
      mockGetProject.mockResolvedValue(makeProject());
      mockLoadParagraphsForAiReplace.mockResolvedValue([
        { chapterId: 'ch-1', paragraphId: 'p-1', translatedText: 'text' },
      ]);
      mockRunProjectAiReplace.mockRejectedValue(
        new AiReplaceTooManyError('Too many paragraphs (101)')
      );
      const res = mockRes();
      await handleProjectAiReplace(mockReq({ body: aiReplaceBody }) as never, res as never);
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { code: string }).code, 'AI_REPLACE_TOO_MANY');
    });
  });

  describe('handleBulkUpdateParagraphs', () => {
    const bulkBody = {
      updates: [{ chapterId: 'ch-1', paragraphId: 'p-1', translatedText: 'Updated text' }],
    };

    it('bulk updates paragraphs and invalidates cache on success', async () => {
      mockGetProject.mockResolvedValue(makeProject());
      const result = { updated: 1 };
      mockBulkUpdateParagraphs.mockResolvedValue(result);
      mockInvalidateUserProjectCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleBulkUpdateParagraphs(mockReq({ body: bulkBody }) as never, res as never);
      assert.deepEqual(res.body, result);
      assert.equal(mockBulkUpdateParagraphs.mock.calls[0]?.[0], 'proj-1');
      assert.equal(mockInvalidateUserProjectCaches.mock.calls[0]?.[1], 'proj-1');
    });

    it('returns 404 when project not found', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleBulkUpdateParagraphs(mockReq({ body: bulkBody }) as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleBulkUpdateParagraphs(mockReq({ body: { updates: [] } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleRenameProject', () => {
    it('renames project and invalidates cache on success', async () => {
      mockUpdateProject.mockResolvedValue({ id: 'proj-1', name: 'Renamed' });
      mockInvalidateUserProjectCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleRenameProject(mockReq({ body: { name: 'Renamed' } }) as never, res as never);
      assert.deepEqual(res.body, { id: 'proj-1', name: 'Renamed' });
      assert.deepEqual(mockUpdateProject.mock.calls[0]?.[1], { name: 'Renamed' });
    });

    it('returns 404 when project not found', async () => {
      mockUpdateProject.mockResolvedValue(null);
      const res = mockRes();
      await handleRenameProject(mockReq({ body: { name: 'Renamed' } }) as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleRenameProject(mockReq({ body: { name: '' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleDeleteProject', () => {
    it('returns success and invalidates cache when deleted', async () => {
      mockDeleteProject.mockResolvedValue(true);
      mockInvalidateUserProjectCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleDeleteProject(mockReq() as never, res as never);
      assert.deepEqual(res.body, { success: true });
      assert.equal(mockDeleteProject.mock.calls[0]?.[0], 'proj-1');
      assert.equal(mockInvalidateUserProjectCaches.mock.calls[0]?.[1], 'proj-1');
    });

    it('returns 404 when project not found', async () => {
      mockDeleteProject.mockResolvedValue(false);
      const res = mockRes();
      await handleDeleteProject(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleUpdateProjectSettings', () => {
    it('updates settings and returns merged settings on success', async () => {
      const project = makeProject();
      const updatedProject = makeProject({
        settings: { ...project.settings, temperature: 0.5 },
      });
      mockGetProject.mockResolvedValueOnce(project).mockResolvedValueOnce(updatedProject);
      mockUpdateProject.mockResolvedValue(updatedProject);
      mockInvalidateUserProjectCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdateProjectSettings(
        mockReq({ body: { temperature: 0.5 } }) as never,
        res as never
      );
      assert.deepEqual(res.body, updatedProject.settings);
      assert.equal(mockUpdateProject.mock.calls[0]?.[1]?.settings?.temperature, 0.5);
    });

    it('returns 404 when project not found on initial load', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateProjectSettings(
        mockReq({ body: { temperature: 0.5 } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 404 when refetch after update fails', async () => {
      const project = makeProject();
      mockGetProject.mockResolvedValueOnce(project).mockResolvedValueOnce(null);
      mockUpdateProject.mockResolvedValue(project);
      const res = mockRes();
      await handleUpdateProjectSettings(
        mockReq({ body: { temperature: 0.5 } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleUpdateProjectSettings(
        mockReq({ body: { temperature: 99 } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleUpdateProjectLanguages', () => {
    it('updates language pair and invalidates caches on success', async () => {
      const project = makeProject();
      const updated = { ...project, sourceLanguage: 'ko', targetLanguage: 'ru' };
      mockGetProject.mockResolvedValue(project);
      mockUpdateProject.mockResolvedValue(updated);
      mockInvalidateAnalysisForProject.mockResolvedValue(undefined);
      mockInvalidateUserProjectCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdateProjectLanguages(
        mockReq({ body: { sourceLanguage: 'ko', targetLanguage: 'ru' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { sourceLanguage: 'ko', targetLanguage: 'ru' });
      assert.equal(mockClearAgentCache.mock.calls[0]?.[0], 'proj-1');
      assert.equal(mockInvalidateAnalysisForProject.mock.calls[0]?.[0], 'proj-1');
    });

    it('returns 409 when language pair is locked', async () => {
      mockGetProject.mockResolvedValue(makeProject());
      mockIsProjectLanguagePairLocked.mockReturnValue(true);
      const res = mockRes();
      await handleUpdateProjectLanguages(
        mockReq({ body: { sourceLanguage: 'ko', targetLanguage: 'ru' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 409);
      assert.equal((res.body as { code: string }).code, 'LANGUAGE_PAIR_LOCKED');
    });

    it('returns 404 when project not found', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateProjectLanguages(
        mockReq({ body: { sourceLanguage: 'ko', targetLanguage: 'ru' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleGetReaderSettings', () => {
    it('returns reader settings on success', async () => {
      const project = makeProject();
      const reader = { fontFamily: 'serif', fontSize: 18, colorScheme: 'light' };
      mockGetProject.mockResolvedValue(project);
      mockGetReaderSettings.mockReturnValue(reader);
      const res = mockRes();
      await handleGetReaderSettings(mockReq() as never, res as never);
      assert.deepEqual(res.body, reader);
      assert.equal(mockGetReaderSettings.mock.calls[0]?.[0], project);
    });

    it('returns 404 when project not found', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleGetReaderSettings(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetReaderSettings(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleUpdateReaderSettings', () => {
    it('returns updated reader settings on success', async () => {
      const reader = { fontFamily: 'serif', fontSize: 18, colorScheme: 'light' };
      mockUpdateReaderSettings.mockResolvedValue(reader);
      mockInvalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdateReaderSettings(mockReq({ body: { fontSize: 18 } }) as never, res as never);
      assert.deepEqual(res.body, reader);
      assert.equal(mockUpdateReaderSettings.mock.calls[0]?.[0], 'proj-1');
      assert.equal(mockInvalidateProjectAndRelatedCaches.mock.calls.length, 1);
    });

    it('returns 404 when project not found', async () => {
      mockUpdateReaderSettings.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateReaderSettings(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Project not found' });
    });
  });

  describe('error branches', () => {
    it('handleGetProject delegates to handleServiceError', async () => {
      mockGetProject.mockRejectedValue(new Error('supabase down'));
      mockHandleServiceError.mockReturnValue(true);
      const res = mockRes();
      await handleGetProject(mockReq() as never, res as never);
      assert.equal(mockHandleServiceError.mock.calls.length, 1);
    });

    it('handleCreateProject returns 500 on unexpected error', async () => {
      mockCreateProject.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleCreateProject(
        mockReq({
          body: { name: 'My Novel', sourceLanguage: 'en', targetLanguage: 'ru' },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 500);
    });

    it('handleSearchProject returns 500 on unexpected error', async () => {
      mockGetProject.mockResolvedValue(makeProject());
      mockSearchParagraphsInProject.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleSearchProject(mockReq({ query: { q: 'hero' } }) as never, res as never);
      assert.equal(res.statusCode, 500);
    });

    it('handleRenameProject returns 500 on unexpected error', async () => {
      mockUpdateProject.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleRenameProject(mockReq({ body: { name: 'Renamed' } }) as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });
});
