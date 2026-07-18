import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { INVALID_TRANSLATOR_PSEUDONYM_CODE } from '../../../shared/translatorPseudonyms.js';

const {
  mockGetPublicationBySlugOrId,
  mockListPublicationsPublic,
  mockListPublicEntities,
  mockGetPublicEntityById,
  mockDismissAnnouncement,
  mockCreateTranslationReport,
  mockGetProject,
  mockGetProjectFull,
  mockUpdateProject,
  mockCreateOrUpdatePublication,
  mockUpdatePublicationDisplaySettings,
  mockUpdatePublicationExportPaths,
  mockUnpublishProject,
  mockGetPublishedNewsPostByIdOrSlug,
  mockListPublishedNewsPosts,
  mockGetUserPublications,
  mockGetReadProgress,
  mockGetPublicationByProjectId,
  mockGetPublicationWithChapters,
  mockGetPublicationChapterContent,
  mockGetGlossaryForPublication,
  mockGetProjectForPublicationExport,
  mockUpdateReadProgress,
  mockResetReadProgress,
  mockSyncPublicationTranslationStatus,
  mockGetActiveAnnouncementForUser,
  mockAssertOwnedActiveTranslatorPseudonym,
  mockWithRedisCache,
  mockRedisGetJson,
  mockRedisSetJson,
  mockRedisDelMany,
  mockInvalidatePublicationCaches,
  mockInvalidatePublicationListCaches,
  mockInvalidateAnnouncementCaches,
  mockInvalidateUserProjectCaches,
  mockInvalidateProjectAndRelatedCaches,
  mockHandleServiceError,
  mockUploadFile,
  mockDeleteFile,
  mockDeleteFiles,
  mockExtractPathFromUrl,
  mockGenerateUniqueFilename,
  mockDownloadFile,
  mockCreateSignedUrl,
  mockListFiles,
  mockExportProject,
  mockCreateServiceRoleClient,
} = vi.hoisted(() => ({
  mockGetPublicationBySlugOrId: vi.fn(),
  mockListPublicationsPublic: vi.fn(),
  mockListPublicEntities: vi.fn(),
  mockGetPublicEntityById: vi.fn(),
  mockDismissAnnouncement: vi.fn(),
  mockCreateTranslationReport: vi.fn(),
  mockGetProject: vi.fn(),
  mockGetProjectFull: vi.fn(),
  mockUpdateProject: vi.fn(),
  mockCreateOrUpdatePublication: vi.fn(),
  mockUpdatePublicationDisplaySettings: vi.fn(),
  mockUpdatePublicationExportPaths: vi.fn(),
  mockUnpublishProject: vi.fn(),
  mockGetPublishedNewsPostByIdOrSlug: vi.fn(),
  mockListPublishedNewsPosts: vi.fn(),
  mockGetUserPublications: vi.fn(),
  mockGetReadProgress: vi.fn(),
  mockGetPublicationByProjectId: vi.fn(),
  mockGetPublicationWithChapters: vi.fn(),
  mockGetPublicationChapterContent: vi.fn(),
  mockGetGlossaryForPublication: vi.fn(),
  mockGetProjectForPublicationExport: vi.fn(),
  mockUpdateReadProgress: vi.fn(),
  mockResetReadProgress: vi.fn(),
  mockSyncPublicationTranslationStatus: vi.fn(),
  mockGetActiveAnnouncementForUser: vi.fn(),
  mockAssertOwnedActiveTranslatorPseudonym: vi.fn(),
  mockWithRedisCache: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  mockRedisGetJson: vi.fn(),
  mockRedisSetJson: vi.fn(),
  mockRedisDelMany: vi.fn(),
  mockInvalidatePublicationCaches: vi.fn(),
  mockInvalidatePublicationListCaches: vi.fn(),
  mockInvalidateAnnouncementCaches: vi.fn(),
  mockInvalidateUserProjectCaches: vi.fn(),
  mockInvalidateProjectAndRelatedCaches: vi.fn(),
  mockHandleServiceError: vi.fn(() => false),
  mockUploadFile: vi.fn(),
  mockDeleteFile: vi.fn(),
  mockDeleteFiles: vi.fn(),
  mockExtractPathFromUrl: vi.fn(),
  mockGenerateUniqueFilename: vi.fn(),
  mockDownloadFile: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockListFiles: vi.fn(),
  mockExportProject: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../services/storage.js', () => ({
  uploadFile: mockUploadFile,
  deleteFile: mockDeleteFile,
  deleteFiles: mockDeleteFiles,
  extractPathFromUrl: mockExtractPathFromUrl,
  generateUniqueFilename: mockGenerateUniqueFilename,
  downloadFile: mockDownloadFile,
  createSignedUrl: mockCreateSignedUrl,
  listFiles: mockListFiles,
}));

vi.mock('../../../services/export/index.js', () => ({
  exportProject: mockExportProject,
}));

vi.mock('../../../logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../services/supabaseClient.js', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

vi.mock('../../../services/supabaseDatabase.js', () => ({
  getProject: mockGetProject,
  getProjectFull: mockGetProjectFull,
  updateProject: mockUpdateProject,
  getPublicationBySlugOrId: mockGetPublicationBySlugOrId,
  listPublicationsPublic: mockListPublicationsPublic,
  listPublicEntities: mockListPublicEntities,
  getPublicEntityById: mockGetPublicEntityById,
  dismissAnnouncement: mockDismissAnnouncement,
  createTranslationReport: mockCreateTranslationReport,
  createOrUpdatePublication: mockCreateOrUpdatePublication,
  updatePublicationDisplaySettings: (...args: unknown[]) =>
    mockUpdatePublicationDisplaySettings(...args),
  updatePublicationExportPaths: mockUpdatePublicationExportPaths,
  unpublishProject: mockUnpublishProject,
  getPublishedNewsPostByIdOrSlug: (...args: unknown[]) =>
    mockGetPublishedNewsPostByIdOrSlug(...args),
  listPublishedNewsPosts: mockListPublishedNewsPosts,
  getUserPublications: mockGetUserPublications,
  getReadProgress: mockGetReadProgress,
  getPublicationByProjectId: mockGetPublicationByProjectId,
  getPublicationWithChapters: mockGetPublicationWithChapters,
  getPublicationChapterContent: mockGetPublicationChapterContent,
  getGlossaryForPublication: mockGetGlossaryForPublication,
  getProjectForPublicationExport: mockGetProjectForPublicationExport,
  updateReadProgress: mockUpdateReadProgress,
  resetReadProgress: mockResetReadProgress,
  syncPublicationTranslationStatus: (...args: unknown[]) =>
    mockSyncPublicationTranslationStatus(...args),
  getActiveAnnouncementForUser: mockGetActiveAnnouncementForUser,
  assertOwnedActiveTranslatorPseudonym: (...args: unknown[]) =>
    mockAssertOwnedActiveTranslatorPseudonym(...args),
}));

vi.mock('../../../middleware/serviceHealth.js', () => ({
  handleServiceError: mockHandleServiceError,
}));

vi.mock('../../../services/redisCache.js', () => ({
  redisGetJson: mockRedisGetJson,
  redisSetJson: mockRedisSetJson,
  redisDelMany: mockRedisDelMany,
  buildRedisKey: (...parts: string[]) => parts.join(':'),
}));

vi.mock('../../../services/cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches: (...args: unknown[]) =>
    mockInvalidateProjectAndRelatedCaches(...args),
}));

vi.mock('../../routeHelpers.js', () => ({
  withRedisCache: mockWithRedisCache,
  invalidatePublicationCaches: mockInvalidatePublicationCaches,
  invalidatePublicationListCaches: (...args: unknown[]) =>
    mockInvalidatePublicationListCaches(...args),
  invalidateAnnouncementCaches: mockInvalidateAnnouncementCaches,
  invalidateUserProjectCaches: mockInvalidateUserProjectCaches,
  projectReportsCountCacheKey: (projectId: string) => `reports-count:${projectId}`,
  readingHistoryCacheKey: (userId: string) => `reading:${userId}`,
  publicationsListCacheKey: () => 'pubs-list',
  publicationCacheKey: (id: string) => `pub:${id}`,
  publicationChaptersCacheKey: (id: string) => `pub-chapters:${id}`,
  publicationChapterCacheKey: (pubId: string, chapterId: string) => `pub-ch:${pubId}:${chapterId}`,
  publicationGlossaryCacheKey: (pubId: string) => `pub-gloss:${pubId}`,
  publicEntitiesCacheKey: (kind?: string) => `entities:${kind ?? 'all'}`,
  publicEntityCacheKey: (id: string) => `entity:${id}`,
  newsListCacheKey: () => 'news-list',
  newsPostCacheKey: (id: string) => `news:${id}`,
  announcementsActiveCacheKey: (role: string, userId?: string) =>
    `ann:${role}:${userId ?? 'guest'}`,
}));

import {
  handleBuildPublicationExports,
  handleDeleteCover,
  handleDismissAnnouncement,
  handleExportDownload,
  handleExportProject,
  handleGetActiveAnnouncement,
  handleGetNewsPost,
  handleGetProjectPublication,
  handleGetPublication,
  handleGetPublicationChapter,
  handleGetPublicationChapters,
  handleGetPublicationGlossary,
  handleGetPublicEntity,
  handleGetReadProgress,
  handleGetUserPublications,
  handleListNews,
  handleListPublicEntities,
  handleListPublications,
  handleMarkChapterRead,
  handlePublicationDownload,
  handlePublishProject,
  handleReportPublication,
  handleUnpublishProject,
  handleUpdateProjectMetadata,
  handleUpdatePublicationDisplaySettings,
  handleUpdateReadingPosition,
  handleUploadCover,
} from './publicationRouteHandlers.js';

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
    send(payload?: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', role: 'author' as const },
    token: 'bearer-token',
    params: { id: 'pub-slug' },
    body: {},
    query: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    ...overrides,
  };
}

function mockCoverFile() {
  return {
    path: '/tmp/cover.jpg',
    originalname: 'cover.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('image-bytes'),
  };
}

function mockSupabaseChapterLookup(chapter: { id: string; number?: number } | null) {
  const single = vi.fn().mockResolvedValue({ data: chapter });
  const eqProject = vi.fn().mockReturnValue({ single });
  const eqChapter = vi.fn().mockReturnValue({ eq: eqProject });
  const select = vi.fn().mockReturnValue({ eq: eqChapter });
  mockCreateServiceRoleClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });
}

describe('publicationRouteHandlers', () => {
  beforeEach(() => {
    mockUploadFile.mockResolvedValue({
      publicUrl: 'https://cdn/cover.jpg',
      path: 'images/cover.jpg',
    });
    mockGenerateUniqueFilename.mockReturnValue('proj-1/cover.jpg');
    mockDeleteFile.mockResolvedValue(undefined);
    mockExtractPathFromUrl.mockReturnValue('old/cover.jpg');
    mockInvalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
    mockAssertOwnedActiveTranslatorPseudonym.mockResolvedValue({
      id: 'trans-1',
      name: 'Translator One',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockHandleServiceError.mockReturnValue(false);
    mockWithRedisCache.mockImplementation(async (_k, _t, fn) => fn());
  });

  describe('handleUploadCover', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = mockRes();
      await handleUploadCover(
        mockReq({ user: undefined, file: mockCoverFile() }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 when no file provided', async () => {
      const res = mockRes();
      await handleUploadCover(mockReq({ params: { projectId: 'proj-1' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when project not found and unlinks temp file', async () => {
      mockGetProject.mockResolvedValue(null);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
      const res = mockRes();
      await handleUploadCover(
        mockReq({ params: { projectId: 'proj-1' }, file: mockCoverFile() }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
      assert.equal(unlinkSpy.mock.calls.length, 1);
    });

    it('uploads cover and updates project on success', async () => {
      mockGetProject.mockResolvedValue({
        id: 'proj-1',
        metadata: { coverImageUrl: 'https://old/cover.jpg' },
      });
      mockUpdateProject.mockResolvedValue({
        id: 'proj-1',
        metadata: { coverImageUrl: 'https://cdn/cover.jpg' },
      });
      const res = mockRes();
      await handleUploadCover(
        mockReq({ params: { projectId: 'proj-1' }, file: mockCoverFile() }) as never,
        res as never
      );
      assert.equal(mockDeleteFile.mock.calls.length, 1);
      assert.equal(mockUploadFile.mock.calls.length, 1);
      assert.deepEqual(
        (res.body as { coverImageUrl: string }).coverImageUrl,
        'https://cdn/cover.jpg'
      );
      assert.equal(mockInvalidateProjectAndRelatedCaches.mock.calls.length, 1);
    });

    it('rolls back upload when project update fails', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1', metadata: {} });
      mockUpdateProject.mockResolvedValue(null);
      const res = mockRes();
      await handleUploadCover(
        mockReq({ params: { projectId: 'proj-1' }, file: mockCoverFile() }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
      assert.equal(mockDeleteFile.mock.calls.length, 1);
    });
  });

  describe('handleDeleteCover', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = mockRes();
      await handleDeleteCover(
        mockReq({ user: undefined, file: mockCoverFile() }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('uploads replacement cover on success', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1', metadata: {} });
      mockUpdateProject.mockResolvedValue({
        id: 'proj-1',
        metadata: { coverImageUrl: 'https://cdn/cover.jpg' },
      });
      const res = mockRes();
      await handleDeleteCover(
        mockReq({ params: { projectId: 'proj-1' }, file: mockCoverFile() }) as never,
        res as never
      );
      assert.equal(mockUploadFile.mock.calls.length, 1);
      assert.deepEqual(
        (res.body as { coverImageUrl: string }).coverImageUrl,
        'https://cdn/cover.jpg'
      );
    });
  });

  describe('handleUpdateProjectMetadata', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = mockRes();
      await handleUpdateProjectMetadata(
        mockReq({
          user: undefined,
          params: { projectId: 'proj-1' },
          body: { metadata: { title: 'X' } },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when project missing', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateProjectMetadata(
        mockReq({ params: { projectId: 'proj-1' }, body: { metadata: { title: 'New' } } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 400 on validation failure', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1', metadata: {} });
      const res = mockRes();
      await handleUpdateProjectMetadata(
        mockReq({ params: { projectId: 'proj-1' }, body: {} }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 400 for invalid translator pseudonym', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1', metadata: {} });
      mockAssertOwnedActiveTranslatorPseudonym.mockRejectedValue(
        Object.assign(new Error('Invalid'), { code: INVALID_TRANSLATOR_PSEUDONYM_CODE })
      );
      const res = mockRes();
      await handleUpdateProjectMetadata(
        mockReq({
          params: { projectId: 'proj-1' },
          body: { metadata: { translatorEntityId: 'bad-trans' } },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { code: string }).code, INVALID_TRANSLATOR_PSEUDONYM_CODE);
    });

    it('updates metadata and syncs translationStatus on success', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1', metadata: { title: 'Old' } });
      mockUpdateProject.mockResolvedValue({
        id: 'proj-1',
        metadata: { title: 'New', translationStatus: 'complete' },
      });
      mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1', slug: 'my-book' });
      const res = mockRes();
      await handleUpdateProjectMetadata(
        mockReq({
          params: { projectId: 'proj-1' },
          body: { metadata: { translationStatus: 'complete' } },
        }) as never,
        res as never
      );
      assert.equal(mockSyncPublicationTranslationStatus.mock.calls.length, 1);
      assert.equal(mockInvalidatePublicationCaches.mock.calls.length, 2);
      assert.equal(mockInvalidatePublicationListCaches.mock.calls.length, 1);
    });

    it('syncs from isCompleteWork legacy flag', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1', metadata: {} });
      mockUpdateProject.mockResolvedValue({ id: 'proj-1', metadata: { isCompleteWork: true } });
      mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1', slug: 'slug' });
      const res = mockRes();
      await handleUpdateProjectMetadata(
        mockReq({
          params: { projectId: 'proj-1' },
          body: { metadata: { isCompleteWork: true } },
        }) as never,
        res as never
      );
      assert.equal(mockSyncPublicationTranslationStatus.mock.calls[0]?.[3], 'complete');
      assert.equal(res.statusCode, 200);
    });
  });

  describe('handleExportProject', () => {
    const tmpDir = os.tmpdir();
    const exportedPath = path.join(tmpDir, 'book.epub');

    it('returns 401 when unauthenticated', async () => {
      const res = mockRes();
      await handleExportProject(
        mockReq({ user: undefined, params: { id: 'proj-1' }, body: { format: 'epub' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleExportProject(
        mockReq({ params: { id: 'proj-1' }, body: { format: 'pdf' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when project not found', async () => {
      mockGetProjectFull.mockResolvedValue(null);
      const res = mockRes();
      await handleExportProject(
        mockReq({ params: { id: 'proj-1' }, body: { format: 'epub' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('exports project with cyrillic name and returns download info', async () => {
      mockGetProjectFull.mockResolvedValue({
        id: 'proj-1',
        name: 'Зенит Колдовства',
        chapters: [],
      });
      mockListFiles.mockResolvedValue([
        { name: 'old.epub', created_at: '2020-01-01T00:00:00.000Z' },
      ]);
      mockExportProject.mockResolvedValue(exportedPath);
      mockCreateSignedUrl.mockResolvedValue({ signedUrl: 'https://signed/export.epub' });
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        const s = String(p);
        return s === tmpDir || s === exportedPath;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('epub-bytes'));
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
      const res = mockRes();
      await handleExportProject(
        mockReq({ params: { id: 'proj-1' }, body: { format: 'epub', author: 'Author' } }) as never,
        res as never
      );
      assert.equal((res.body as { success: boolean }).success, true);
      assert.equal(mockDeleteFiles.mock.calls.length, 1);
      assert.equal(mockUploadFile.mock.calls.length, 1);
    });
  });

  describe('handleExportDownload', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = mockRes();
      await handleExportDownload(
        mockReq({
          user: undefined,
          params: { id: 'proj-1' },
          query: { path: 'proj-1/book.epub' },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on invalid query', async () => {
      const res = mockRes();
      await handleExportDownload(
        mockReq({ params: { id: 'proj-1' }, query: {} }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 403 for path traversal', async () => {
      const res = mockRes();
      await handleExportDownload(
        mockReq({ params: { id: 'proj-1' }, query: { path: 'other/book.epub' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 403);
    });

    it('returns 404 when project missing', async () => {
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleExportDownload(
        mockReq({ params: { id: 'proj-1' }, query: { path: 'proj-1/book.epub' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('streams export file on success', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1' });
      mockDownloadFile.mockResolvedValue(Buffer.from('epub'));
      const res = mockRes();
      await handleExportDownload(
        mockReq({ params: { id: 'proj-1' }, query: { path: 'proj-1/book.epub' } }) as never,
        res as never
      );
      assert.equal(res.headers['Content-Type'], 'application/epub+zip');
      assert.deepEqual(res.body, Buffer.from('epub'));
    });
  });

  describe('handleBuildPublicationExports', () => {
    const tmpDir = os.tmpdir();
    const exportedPath = path.join(tmpDir, 'book.epub');

    it('returns 401 when unauthenticated', async () => {
      const res = mockRes();
      await handleBuildPublicationExports(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 404 when publication missing', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue(null);
      const res = mockRes();
      await handleBuildPublicationExports(
        mockReq({ body: { formats: ['epub'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 400 when publication not published', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({
        id: 'pub-1',
        status: 'draft',
        projectId: 'proj-1',
      });
      const res = mockRes();
      await handleBuildPublicationExports(
        mockReq({ body: { formats: ['epub'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 403 when user is not owner', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({
        id: 'pub-1',
        status: 'published',
        projectId: 'proj-1',
      });
      mockGetProject.mockResolvedValue(null);
      const res = mockRes();
      await handleBuildPublicationExports(
        mockReq({ body: { formats: ['epub'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 403);
    });

    it('returns 400 when no translated chapters', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({
        id: 'pub-1',
        status: 'published',
        projectId: 'proj-1',
        title: 'Book',
      });
      mockGetProject.mockResolvedValue({ id: 'proj-1' });
      mockGetProjectForPublicationExport.mockResolvedValue({
        id: 'proj-1',
        name: 'Book',
        chapters: [{ id: 'ch-1', status: 'pending', translatedText: null, paragraphs: [] }],
      });
      const res = mockRes();
      await handleBuildPublicationExports(
        mockReq({ body: { formats: ['epub'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('builds epub and fb2 exports on success', async () => {
      mockGetPublicationBySlugOrId
        .mockResolvedValueOnce({
          id: 'pub-1',
          status: 'published',
          projectId: 'proj-1',
          slug: 'my-book',
          title: 'Book',
        })
        .mockResolvedValueOnce({
          id: 'pub-1',
          epubStoragePath: 'publication-pub-1/my-book.epub',
          fb2StoragePath: 'publication-pub-1/my-book.fb2',
        });
      mockGetProject.mockResolvedValue({ id: 'proj-1' });
      mockGetProjectForPublicationExport.mockResolvedValue({
        id: 'proj-1',
        name: 'Book',
        chapters: [{ id: 'ch-1', status: 'completed', translatedText: 'Hello', paragraphs: [] }],
      });
      mockExportProject.mockResolvedValue(exportedPath);
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        const s = String(p);
        return s === tmpDir || s === exportedPath;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('bytes'));
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
      const res = mockRes();
      await handleBuildPublicationExports(
        mockReq({ body: { formats: ['epub', 'fb2'] } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { epubReady: true, fb2Ready: true });
      assert.equal(mockUpdatePublicationExportPaths.mock.calls.length, 1);
    });
  });

  describe('handleUpdatePublicationDisplaySettings', () => {
    it('returns 400 on empty body', async () => {
      const res = mockRes();
      await handleUpdatePublicationDisplaySettings(mockReq({ body: {} }) as never, res as never);
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'No display settings to update');
    });

    it('returns 404 when publication missing', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdatePublicationDisplaySettings(
        mockReq({ body: { showGlossary: true } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('updates settings on success', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({
        id: 'pub-1',
        projectId: 'proj-1',
        status: 'published',
      });
      mockGetProject.mockResolvedValue({ id: 'proj-1' });
      mockUpdatePublicationDisplaySettings.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdatePublicationDisplaySettings(
        mockReq({ body: { showGlossary: false } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { success: true });
      assert.equal(mockUpdatePublicationDisplaySettings.mock.calls.length, 1);
    });
  });

  describe('handlePublicationDownload', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = mockRes();
      await handlePublicationDownload(
        mockReq({ user: undefined, query: { format: 'epub' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on invalid format query', async () => {
      const res = mockRes();
      await handlePublicationDownload(mockReq({ query: { format: 'pdf' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when export not built', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({
        id: 'pub-1',
        status: 'published',
        epubStoragePath: null,
      });
      const res = mockRes();
      await handlePublicationDownload(
        mockReq({ query: { format: 'epub' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
      assert.equal((res.body as { error: string }).error, 'Export not built yet');
    });

    it('downloads built epub on success', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({
        id: 'pub-1',
        status: 'published',
        epubStoragePath: 'publication-pub-1/book.epub',
      });
      mockDownloadFile.mockResolvedValue(Buffer.from('epub'));
      const res = mockRes();
      await handlePublicationDownload(
        mockReq({ query: { format: 'epub' } }) as never,
        res as never
      );
      assert.equal(res.headers['Content-Type'], 'application/epub+zip');
      assert.deepEqual(res.body, Buffer.from('epub'));
    });
  });

  describe('handleListPublicEntities', () => {
    it('returns 400 on invalid query', async () => {
      const res = mockRes();
      await handleListPublicEntities(
        mockReq({ query: { kind: 'invalid-kind', limit: '0' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Invalid query parameters');
    });

    it('returns entities on success via cache', async () => {
      mockListPublicEntities.mockResolvedValue([{ id: 'ent-1', name: 'Author' }]);
      const res = mockRes();
      await handleListPublicEntities(mockReq({ query: { kind: 'author' } }) as never, res as never);
      assert.deepEqual(res.body, [{ id: 'ent-1', name: 'Author' }]);
      assert.equal(mockWithRedisCache.mock.calls.length, 1);
    });

    it('returns entities with pagination params', async () => {
      mockListPublicEntities.mockResolvedValue([{ id: 'ent-2', name: 'Page' }]);
      const res = mockRes();
      await handleListPublicEntities(
        mockReq({ query: { kind: 'translator', limit: '5', offset: '10' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, [{ id: 'ent-2', name: 'Page' }]);
      assert.equal(mockListPublicEntities.mock.calls.length, 1);
    });
  });

  describe('handleGetPublicEntity', () => {
    it('returns cached entity without DB call', async () => {
      mockRedisGetJson.mockResolvedValue({ id: 'ent-1', name: 'Cached' });
      const res = mockRes();
      await handleGetPublicEntity(mockReq({ params: { id: 'ent-1' } }) as never, res as never);
      assert.deepEqual(res.body, { id: 'ent-1', name: 'Cached' });
      assert.equal(mockGetPublicEntityById.mock.calls.length, 0);
    });

    it('loads entity from DB and caches on miss', async () => {
      mockRedisGetJson.mockResolvedValue(null);
      mockGetPublicEntityById.mockResolvedValue({ id: 'ent-1', name: 'Fresh' });
      const res = mockRes();
      await handleGetPublicEntity(mockReq({ params: { id: 'ent-1' } }) as never, res as never);
      assert.deepEqual(res.body, { id: 'ent-1', name: 'Fresh' });
      assert.equal(mockRedisSetJson.mock.calls.length, 1);
    });

    it('returns 404 when entity not found', async () => {
      mockRedisGetJson.mockResolvedValue(null);
      mockGetPublicEntityById.mockResolvedValue(null);
      const res = mockRes();
      await handleGetPublicEntity(mockReq({ params: { id: 'missing' } }) as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleListNews', () => {
    it('returns 400 on invalid query', async () => {
      const res = mockRes();
      await handleListNews(mockReq({ query: { limit: '0' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns news list on success', async () => {
      mockListPublishedNewsPosts.mockResolvedValue([{ id: 'news-1', title: 'Launch' }]);
      const res = mockRes();
      await handleListNews(
        mockReq({ query: { limit: '10', category: 'feature' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, [{ id: 'news-1', title: 'Launch' }]);
      assert.equal(mockWithRedisCache.mock.calls.length, 1);
    });
  });

  describe('handleGetNewsPost', () => {
    it('returns 404 when post missing', async () => {
      mockGetPublishedNewsPostByIdOrSlug.mockResolvedValue(null);
      const res = mockRes();
      await handleGetNewsPost(mockReq({ params: { idOrSlug: 'missing' } }) as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns post on success', async () => {
      mockGetPublishedNewsPostByIdOrSlug.mockResolvedValue({ id: 'news-1', title: 'Update' });
      const res = mockRes();
      await handleGetNewsPost(mockReq({ params: { idOrSlug: 'update' } }) as never, res as never);
      assert.deepEqual(res.body, { id: 'news-1', title: 'Update' });
    });
  });

  describe('handleGetActiveAnnouncement', () => {
    it('returns active announcement for guest', async () => {
      mockGetActiveAnnouncementForUser.mockResolvedValue({ id: 'ann-1', title: 'Welcome' });
      const res = mockRes();
      await handleGetActiveAnnouncement(mockReq({ user: undefined }) as never, res as never);
      assert.deepEqual(res.body, { id: 'ann-1', title: 'Welcome' });
    });

    it('returns active announcement for authenticated user', async () => {
      mockGetActiveAnnouncementForUser.mockResolvedValue(null);
      const res = mockRes();
      await handleGetActiveAnnouncement(mockReq() as never, res as never);
      assert.equal(res.body, null);
    });
  });

  describe('handleDismissAnnouncement', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = mockRes();
      await handleDismissAnnouncement(
        mockReq({ user: undefined, body: { contentVersion: 1 } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleDismissAnnouncement(mockReq({ body: {} }) as never, res as never);
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Validation failed');
    });

    it('dismisses announcement and returns 204', async () => {
      mockDismissAnnouncement.mockResolvedValue(undefined);
      const res = mockRes();
      await handleDismissAnnouncement(
        mockReq({ params: { id: 'ann-1' }, body: { contentVersion: 1 } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 204);
      assert.equal(mockDismissAnnouncement.mock.calls[0]?.[0], 'user-1');
      assert.equal(mockInvalidateAnnouncementCaches.mock.calls.length, 1);
    });
  });

  describe('handleListPublications', () => {
    it('returns publication list via cache wrapper', async () => {
      mockListPublicationsPublic.mockResolvedValue([{ id: 'pub-1' }]);
      const res = mockRes();
      await handleListPublications(mockReq({ query: { limit: '10' } }) as never, res as never);
      assert.deepEqual(res.body, [{ id: 'pub-1' }]);
      assert.equal(mockWithRedisCache.mock.calls.length, 1);
    });

    it('falls back to defaults on invalid query', async () => {
      mockListPublicationsPublic.mockResolvedValue([]);
      const res = mockRes();
      await handleListPublications(mockReq({ query: { limit: '9999' } }) as never, res as never);
      assert.deepEqual(res.body, []);
      assert.equal(mockListPublicationsPublic.mock.calls.length, 1);
    });
  });

  describe('handleGetPublication', () => {
    it('returns publication on success', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1', title: 'Novel' });
      const res = mockRes();
      await handleGetPublication(mockReq() as never, res as never);
      assert.deepEqual(res.body, { id: 'pub-1', title: 'Novel' });
    });

    it('returns 404 when publication missing', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue(null);
      const res = mockRes();
      await handleGetPublication(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleGetPublicationChapters', () => {
    it('returns 404 when publication missing', async () => {
      mockGetPublicationWithChapters.mockResolvedValue(null);
      const res = mockRes();
      await handleGetPublicationChapters(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns chapters on success', async () => {
      mockGetPublicationWithChapters.mockResolvedValue({
        publication: { id: 'pub-1' },
        chapters: [{ id: 'ch-1', title: 'Chapter 1' }],
      });
      const res = mockRes();
      await handleGetPublicationChapters(mockReq() as never, res as never);
      assert.equal((res.body as { chapters: unknown[] }).chapters.length, 1);
    });
  });

  describe('handleGetPublicationChapter', () => {
    it('returns 404 when publication missing', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue(null);
      const res = mockRes();
      await handleGetPublicationChapter(
        mockReq({ params: { id: 'pub-1', chapterId: 'ch-1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 404 when chapter missing', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1' });
      mockGetPublicationChapterContent.mockResolvedValue(null);
      const res = mockRes();
      await handleGetPublicationChapter(
        mockReq({ params: { id: 'pub-1', chapterId: 'ch-missing' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns chapter content on success', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1' });
      mockGetPublicationChapterContent.mockResolvedValue({ id: 'ch-1', paragraphs: [] });
      const res = mockRes();
      await handleGetPublicationChapter(
        mockReq({ params: { id: 'pub-1', chapterId: 'ch-1' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'ch-1', paragraphs: [] });
    });
  });

  describe('handleGetPublicationGlossary', () => {
    it('returns empty array when glossary hidden', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1', showGlossary: false });
      const res = mockRes();
      await handleGetPublicationGlossary(mockReq() as never, res as never);
      assert.deepEqual(res.body, []);
      assert.equal(mockGetGlossaryForPublication.mock.calls.length, 0);
    });

    it('returns glossary entries on success', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1', showGlossary: true });
      mockGetGlossaryForPublication.mockResolvedValue([{ term: 'Hero', translation: 'Герой' }]);
      const res = mockRes();
      await handleGetPublicationGlossary(mockReq() as never, res as never);
      assert.deepEqual(res.body, [{ term: 'Hero', translation: 'Герой' }]);
    });
  });

  describe('handleGetReadProgress', () => {
    it('returns 404 when publication missing', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue(null);
      const res = mockRes();
      await handleGetReadProgress(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns progress for authenticated user', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1' });
      mockGetReadProgress.mockResolvedValue({
        lastReadChapterNumber: 3,
      });
      const res = mockRes();
      await handleGetReadProgress(mockReq() as never, res as never);
      assert.deepEqual(res.body, {
        lastReadChapterNumber: 3,
      });
    });
  });

  describe('handleReportPublication', () => {
    it('returns 404 when publication missing', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue(null);
      const res = mockRes();
      await handleReportPublication(
        mockReq({ body: { chapterId: 'ch-1', description: 'Typo' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 400 on validation failure', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      const res = mockRes();
      await handleReportPublication(
        mockReq({ body: { chapterId: '', description: '' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('creates report and invalidates cache on success', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      mockCreateTranslationReport.mockResolvedValue({ id: 'rep-1' });
      const res = mockRes();
      await handleReportPublication(
        mockReq({ body: { chapterId: 'ch-1', description: 'Bad translation' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { success: true, id: 'rep-1' });
      assert.equal(mockRedisDelMany.mock.calls.length, 1);
    });

    it('returns 429 when rate limited', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      mockCreateTranslationReport.mockRejectedValue(
        new Error('Please wait before reporting again')
      );
      const res = mockRes();
      await handleReportPublication(
        mockReq({ body: { chapterId: 'ch-1', description: 'Typo' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 429);
    });
  });

  describe('handleMarkChapterRead', () => {
    it('returns 404 when publication missing', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue(null);
      const res = mockRes();
      await handleMarkChapterRead(
        mockReq({ params: { id: 'pub-1', chapterId: 'ch-1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('returns 404 when chapter not in project', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      mockSupabaseChapterLookup(null);
      const res = mockRes();
      await handleMarkChapterRead(
        mockReq({ params: { id: 'pub-1', chapterId: 'ch-1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('marks chapter read and clears caches on success', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      mockSupabaseChapterLookup({ id: 'ch-1', number: 5 });
      mockUpdateReadProgress.mockResolvedValue({ lastReadChapterNumber: 5 });
      const res = mockRes();
      await handleMarkChapterRead(
        mockReq({ params: { id: 'pub-1', chapterId: 'ch-1' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { lastReadChapterNumber: 5 });
      assert.equal(mockUpdateReadProgress.mock.calls.length, 1);
      assert.equal(mockUpdateReadProgress.mock.calls[0]?.[2], 5);
      assert.equal(mockRedisDelMany.mock.calls.length, 1);
    });
  });

  describe('handleUpdateReadingPosition', () => {
    it('returns 410 deprecated', async () => {
      const res = mockRes();
      await handleUpdateReadingPosition(
        mockReq({ body: { chapterId: 'ch-1', paragraphIndex: 0 } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 410);
    });
  });

  describe('handlePublishProject', () => {
    it('returns 400 when validation fails', async () => {
      const res = mockRes();
      await handlePublishProject(
        mockReq({ params: { projectId: 'proj-1' }, body: { coverImageUrl: 'not-a-url' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 400 when translator pseudonym missing', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1', metadata: {} });
      const res = mockRes();
      await handlePublishProject(
        mockReq({ params: { projectId: 'proj-1' }, body: { title: 'My Book' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { code: string }).code, 'TRANSLATOR_PSEUDONYM_REQUIRED');
    });

    it('returns 400 for invalid translator pseudonym', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1', metadata: {} });
      mockAssertOwnedActiveTranslatorPseudonym.mockRejectedValue(
        Object.assign(new Error('Invalid'), { code: INVALID_TRANSLATOR_PSEUDONYM_CODE })
      );
      const res = mockRes();
      await handlePublishProject(
        mockReq({
          params: { projectId: 'proj-1' },
          body: { translatorEntityId: 'bad-trans', title: 'Book' },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { code: string }).code, INVALID_TRANSLATOR_PSEUDONYM_CODE);
    });

    it('publishes project on success', async () => {
      mockGetProject.mockResolvedValue({
        id: 'proj-1',
        metadata: { authorEntityId: 'auth-1', authors: ['Fallback Author'] },
      });
      mockGetPublicEntityById.mockResolvedValue({ id: 'auth-1', name: 'Entity Author' });
      mockCreateOrUpdatePublication.mockResolvedValue({
        id: 'pub-1',
        slug: 'my-book',
        status: 'published',
      });
      const res = mockRes();
      await handlePublishProject(
        mockReq({
          params: { projectId: 'proj-1' },
          body: {
            translatorEntityId: 'trans-1',
            title: 'My Book',
            isCompleteWork: true,
          },
        }) as never,
        res as never
      );
      assert.equal((res.body as { id: string }).id, 'pub-1');
      assert.equal(mockCreateOrUpdatePublication.mock.calls.length, 1);
      assert.equal(mockInvalidatePublicationListCaches.mock.calls.length, 1);
    });
  });

  describe('handleUnpublishProject', () => {
    it('returns 404 when publication not found', async () => {
      mockUnpublishProject.mockResolvedValue(false);
      const res = mockRes();
      await handleUnpublishProject(
        mockReq({ params: { projectId: 'proj-1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });

    it('unpublishes and invalidates caches on success', async () => {
      mockUnpublishProject.mockResolvedValue(true);
      const res = mockRes();
      await handleUnpublishProject(
        mockReq({ params: { projectId: 'proj-1' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { success: true });
      assert.equal(mockInvalidateUserProjectCaches.mock.calls.length, 1);
    });
  });

  describe('handleGetUserPublications', () => {
    it('returns user publications list', async () => {
      mockGetUserPublications.mockResolvedValue([{ id: 'pub-1' }]);
      const res = mockRes();
      await handleGetUserPublications(mockReq() as never, res as never);
      assert.deepEqual(res.body, [{ id: 'pub-1' }]);
      assert.equal(mockGetUserPublications.mock.calls[0]?.[0], 'user-1');
    });
  });

  describe('handleGetProjectPublication', () => {
    it('returns publication for project', async () => {
      mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      const res = mockRes();
      await handleGetProjectPublication(
        mockReq({ params: { projectId: 'proj-1' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'pub-1', projectId: 'proj-1' });
    });

    it('returns null when publication missing', async () => {
      mockGetPublicationByProjectId.mockResolvedValue(null);
      const res = mockRes();
      await handleGetProjectPublication(
        mockReq({ params: { projectId: 'proj-1' } }) as never,
        res as never
      );
      assert.equal(res.body, null);
    });
  });

  describe('error branches', () => {
    it('handleListPublications returns 500 on unexpected error', async () => {
      mockListPublicationsPublic.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleListPublications(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });

    it('handleListPublications delegates to handleServiceError', async () => {
      mockListPublicationsPublic.mockRejectedValue(new Error('supabase down'));
      mockHandleServiceError.mockReturnValue(true);
      const res = mockRes();
      await handleListPublications(mockReq() as never, res as never);
      assert.equal(mockHandleServiceError.mock.calls.length, 1);
    });

    it('handleGetPublication returns 500 on unexpected error', async () => {
      mockGetPublicationBySlugOrId.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleGetPublication(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });

    it('handleGetUserPublications returns 500 on unexpected error', async () => {
      mockGetUserPublications.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleGetUserPublications(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });

    it('handlePublishProject returns 400 when createOrUpdatePublication fails', async () => {
      mockGetProject.mockResolvedValue({ id: 'proj-1', metadata: {} });
      mockCreateOrUpdatePublication.mockRejectedValue(new Error('Publish failed'));
      const res = mockRes();
      await handlePublishProject(
        mockReq({
          params: { projectId: 'proj-1' },
          body: { translatorEntityId: 'trans-1', title: 'Book' },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Publish failed');
    });

    it('handleReportPublication returns 500 on unexpected error', async () => {
      mockGetPublicationBySlugOrId.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      mockCreateTranslationReport.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleReportPublication(
        mockReq({ body: { chapterId: 'ch-1', description: 'Typo' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 500);
    });
  });
});
