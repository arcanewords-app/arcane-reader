import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPublicEntity: vi.fn(),
  updatePublicEntity: vi.fn(),
  deletePublicEntity: vi.fn(),
  countPublicationsUsingEntity: vi.fn(),
  getPublicEntityById: vi.fn(),
  listNewsPostsAdmin: vi.fn(),
  getNewsPostByIdAdmin: vi.fn(),
  createNewsPost: vi.fn(),
  updateNewsPost: vi.fn(),
  publishNewsPost: vi.fn(),
  deleteNewsPost: vi.fn(),
  listAnnouncementAlertsAdmin: vi.fn(),
  createAnnouncementAlert: vi.fn(),
  createAnnouncementFromNews: vi.fn(),
  updateAnnouncementAlert: vi.fn(),
  deleteAnnouncementAlert: vi.fn(),
  listPublicationsAdmin: vi.fn(),
  unpublishPublicationAdmin: vi.fn(),
  listProjectsAdmin: vi.fn(),
  unpublishProjectAdmin: vi.fn(),
  deleteProjectAdmin: vi.fn(),
  listUsersAdmin: vi.fn(),
  updateUserRoleAdmin: vi.fn(),
  countAdminUsersWithRole: vi.fn(),
  listCatalogTranslationRequestsAdmin: vi.fn(),
  updateCatalogTranslationRequestAdmin: vi.fn(),
  deleteCatalogTranslationRequestAdmin: vi.fn(),
  handleServiceError: vi.fn(() => false),
  invalidatePublicationCaches: vi.fn(),
  invalidatePublicationListCaches: vi.fn(),
  invalidateUserProjectCaches: vi.fn(),
  invalidatePublicEntitiesCaches: vi.fn(),
  invalidateNewsCaches: vi.fn(),
  invalidateAnnouncementCaches: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  generateUniqueFilename: vi.fn(),
  redisDelMany: vi.fn(),
  invalidateProfileCache: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock('../../../services/supabaseDatabase.js', () => ({
  createPublicEntity: mocks.createPublicEntity,
  updatePublicEntity: mocks.updatePublicEntity,
  deletePublicEntity: mocks.deletePublicEntity,
  countPublicationsUsingEntity: (...args: unknown[]) => mocks.countPublicationsUsingEntity(...args),
  getPublicEntityById: mocks.getPublicEntityById,
  listNewsPostsAdmin: mocks.listNewsPostsAdmin,
  getNewsPostByIdAdmin: mocks.getNewsPostByIdAdmin,
  createNewsPost: mocks.createNewsPost,
  updateNewsPost: mocks.updateNewsPost,
  publishNewsPost: mocks.publishNewsPost,
  deleteNewsPost: mocks.deleteNewsPost,
  listAnnouncementAlertsAdmin: mocks.listAnnouncementAlertsAdmin,
  createAnnouncementAlert: mocks.createAnnouncementAlert,
  createAnnouncementFromNews: mocks.createAnnouncementFromNews,
  updateAnnouncementAlert: mocks.updateAnnouncementAlert,
  deleteAnnouncementAlert: mocks.deleteAnnouncementAlert,
  listPublicationsAdmin: mocks.listPublicationsAdmin,
  unpublishPublicationAdmin: mocks.unpublishPublicationAdmin,
  listProjectsAdmin: mocks.listProjectsAdmin,
  unpublishProjectAdmin: mocks.unpublishProjectAdmin,
  deleteProjectAdmin: mocks.deleteProjectAdmin,
  listUsersAdmin: mocks.listUsersAdmin,
  updateUserRoleAdmin: mocks.updateUserRoleAdmin,
  countAdminUsersWithRole: mocks.countAdminUsersWithRole,
  listCatalogTranslationRequestsAdmin: (...args: unknown[]) =>
    mocks.listCatalogTranslationRequestsAdmin(...args),
  updateCatalogTranslationRequestAdmin: (...args: unknown[]) =>
    mocks.updateCatalogTranslationRequestAdmin(...args),
  deleteCatalogTranslationRequestAdmin: (...args: unknown[]) =>
    mocks.deleteCatalogTranslationRequestAdmin(...args),
}));

vi.mock('../../../middleware/serviceHealth.js', () => ({
  handleServiceError: mocks.handleServiceError,
}));

vi.mock('../../routeHelpers.js', () => ({
  invalidatePublicationCaches: mocks.invalidatePublicationCaches,
  invalidatePublicationListCaches: (...args: unknown[]) =>
    mocks.invalidatePublicationListCaches(...args),
  invalidateUserProjectCaches: mocks.invalidateUserProjectCaches,
  invalidatePublicEntitiesCaches: (...args: unknown[]) =>
    mocks.invalidatePublicEntitiesCaches(...args),
  invalidateNewsCaches: mocks.invalidateNewsCaches,
  invalidateAnnouncementCaches: mocks.invalidateAnnouncementCaches,
}));

vi.mock('../../../services/storage.js', () => ({
  uploadFile: mocks.uploadFile,
  deleteFile: mocks.deleteFile,
  generateUniqueFilename: mocks.generateUniqueFilename,
}));

vi.mock('../../../services/redisCache.js', () => ({
  buildRedisKey: (prefix: string, id: string) => `${prefix}:${id}`,
  redisDelMany: mocks.redisDelMany,
}));

vi.mock('../../../middleware/auth.js', () => ({
  invalidateProfileCache: mocks.invalidateProfileCache,
}));

vi.mock('../../../services/supabaseClient.js', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import {
  handleCreatePublicEntity,
  handleUpdatePublicEntity,
  handleDeletePublicEntity,
  handleGetPublicEntityUsage,
  handleListAdminNews,
  handleCreateNewsPost,
  handleGetAdminNewsPost,
  handleUpdateNewsPost,
  handleDeleteNewsPost,
  handlePublishNewsPost,
  handleTranslateNewsPost,
  handleListAnnouncementAlerts,
  handleCreateAnnouncementAlert,
  handleCreateAnnouncementFromNews,
  handleUpdateAnnouncementAlert,
  handleDeleteAnnouncementAlert,
  handleListAdminPublications,
  handleUnpublishPublicationAdmin,
  handleListAdminProjects,
  handleUnpublishProjectAdmin,
  handleDeleteProjectAdmin,
  handleListAdminUsers,
  handleUpdateUserRoleAdmin,
  handleListAdminTranslationRequests,
  handleUpdateAdminTranslationRequest,
  handleDeleteAdminTranslationRequest,
} from './adminRouteHandlers.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    sent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send() {
      this.sent = true;
      return this;
    },
  };
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'admin-1', role: 'admin' as const },
    token: 'bearer-token',
    params: { id: 'entity-1', newsId: 'news-1' },
    body: {},
    query: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
}

function mockProfileLookup(role: string) {
  const single = vi.fn().mockResolvedValue({ data: { role }, error: null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  mocks.createServiceRoleClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });
}

const validNewsBody = {
  title: 'Release',
  summary: 'Short summary',
  slug: 'release',
  body: 'Hello',
  category: 'feature',
};

describe('adminRouteHandlers', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.handleServiceError.mockReturnValue(false);
  });

  describe('handleCreatePublicEntity', () => {
    it('creates entity and returns 201', async () => {
      mocks.createPublicEntity.mockResolvedValue({
        id: 'entity-new',
        kind: 'author',
        name: 'Jane',
      });
      mocks.invalidatePublicEntitiesCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleCreatePublicEntity(
        mockReq({ body: { kind: 'author', name: 'Jane' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 201);
      assert.deepEqual(res.body, { id: 'entity-new', kind: 'author', name: 'Jane' });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleCreatePublicEntity(
        mockReq({ user: undefined, body: { kind: 'author', name: 'Jane' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on invalid body', async () => {
      const res = mockRes();
      await handleCreatePublicEntity(
        mockReq({ body: { kind: 'author', name: '' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 500 on unexpected error', async () => {
      mocks.createPublicEntity.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleCreatePublicEntity(
        mockReq({ body: { kind: 'author', name: 'Jane' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleUpdatePublicEntity', () => {
    it('updates entity on success', async () => {
      mocks.getPublicEntityById.mockResolvedValue({ id: 'entity-1', kind: 'author' });
      mocks.updatePublicEntity.mockResolvedValue({ id: 'entity-1', name: 'Updated' });
      mocks.invalidatePublicEntitiesCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdatePublicEntity(mockReq({ body: { name: 'Updated' } }) as never, res as never);
      assert.deepEqual(res.body, { id: 'entity-1', name: 'Updated' });
    });

    it('returns 404 when entity missing', async () => {
      mocks.getPublicEntityById.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdatePublicEntity(mockReq({ body: { name: 'Updated' } }) as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 500 on unexpected error', async () => {
      mocks.getPublicEntityById.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleUpdatePublicEntity(mockReq({ body: { name: 'Updated' } }) as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleDeletePublicEntity', () => {
    it('returns 409 when entity is in use', async () => {
      mocks.getPublicEntityById.mockResolvedValue({ id: 'entity-1', kind: 'author' });
      mocks.countPublicationsUsingEntity.mockResolvedValue(3);
      const res = mockRes();
      await handleDeletePublicEntity(mockReq() as never, res as never);
      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body, { error: 'Entity is used by publications', usageCount: 3 });
    });

    it('returns 204 when entity deleted', async () => {
      mocks.getPublicEntityById.mockResolvedValue({ id: 'entity-1', kind: 'author' });
      mocks.countPublicationsUsingEntity.mockResolvedValue(0);
      mocks.deletePublicEntity.mockResolvedValue(undefined);
      mocks.invalidatePublicEntitiesCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleDeletePublicEntity(mockReq() as never, res as never);
      assert.equal(res.statusCode, 204);
      assert.equal(res.sent, true);
    });

    it('returns 404 when entity missing', async () => {
      mocks.getPublicEntityById.mockResolvedValue(null);
      const res = mockRes();
      await handleDeletePublicEntity(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleGetPublicEntityUsage', () => {
    it('returns usage count', async () => {
      mocks.getPublicEntityById.mockResolvedValue({ id: 'entity-1' });
      mocks.countPublicationsUsingEntity.mockResolvedValue(5);
      const res = mockRes();
      await handleGetPublicEntityUsage(mockReq() as never, res as never);
      assert.deepEqual(res.body, { usageCount: 5 });
    });

    it('returns 404 when entity missing', async () => {
      mocks.getPublicEntityById.mockResolvedValue(null);
      const res = mockRes();
      await handleGetPublicEntityUsage(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleListAdminNews', () => {
    it('returns news list on success', async () => {
      mocks.listNewsPostsAdmin.mockResolvedValue({ items: [{ id: 'n1' }], total: 1 });
      const res = mockRes();
      await handleListAdminNews(mockReq({ query: {} }) as never, res as never);
      assert.deepEqual(res.body, { items: [{ id: 'n1' }], total: 1 });
    });

    it('returns 400 on invalid query', async () => {
      const res = mockRes();
      await handleListAdminNews(mockReq({ query: { limit: '-1' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleCreateNewsPost', () => {
    it('creates post and returns 201', async () => {
      mocks.createNewsPost.mockResolvedValue({ id: 'n-new', title: 'Release' });
      mocks.invalidateNewsCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleCreateNewsPost(mockReq({ body: validNewsBody }) as never, res as never);
      assert.equal(res.statusCode, 201);
      assert.deepEqual(res.body, { id: 'n-new', title: 'Release' });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleCreateNewsPost(
        mockReq({ user: undefined, body: validNewsBody }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleCreateNewsPost(mockReq({ body: { title: '' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleGetAdminNewsPost', () => {
    it('returns post on success', async () => {
      mocks.getNewsPostByIdAdmin.mockResolvedValue({ id: 'n1', title: 'News' });
      const res = mockRes();
      await handleGetAdminNewsPost(mockReq({ params: { id: 'n1' } }) as never, res as never);
      assert.deepEqual(res.body, { id: 'n1', title: 'News' });
    });

    it('returns 404 when post missing', async () => {
      mocks.getNewsPostByIdAdmin.mockResolvedValue(null);
      const res = mockRes();
      await handleGetAdminNewsPost(mockReq({ params: { id: 'n-missing' } }) as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleUpdateNewsPost', () => {
    it('updates post on success', async () => {
      mocks.getNewsPostByIdAdmin.mockResolvedValue({ id: 'n1', slug: 'old-slug' });
      mocks.updateNewsPost.mockResolvedValue({ id: 'n1', slug: 'new-slug', title: 'Updated' });
      mocks.invalidateNewsCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdateNewsPost(
        mockReq({ params: { id: 'n1' }, body: { title: 'Updated' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'n1', slug: 'new-slug', title: 'Updated' });
    });

    it('returns 404 when post missing', async () => {
      mocks.getNewsPostByIdAdmin.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateNewsPost(
        mockReq({ params: { id: 'n1' }, body: { title: 'Updated' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleDeleteNewsPost', () => {
    it('returns 204 on success', async () => {
      mocks.getNewsPostByIdAdmin.mockResolvedValue({ id: 'n1', slug: 'slug' });
      mocks.deleteNewsPost.mockResolvedValue(undefined);
      mocks.invalidateNewsCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleDeleteNewsPost(mockReq({ params: { id: 'n1' } }) as never, res as never);
      assert.equal(res.statusCode, 204);
    });

    it('returns 409 when active alerts exist', async () => {
      mocks.getNewsPostByIdAdmin.mockResolvedValue({ id: 'n1', slug: 'slug' });
      mocks.deleteNewsPost.mockRejectedValue(
        Object.assign(new Error('has alerts'), { code: 'NEWS_HAS_ACTIVE_ALERTS' })
      );
      const res = mockRes();
      await handleDeleteNewsPost(mockReq({ params: { id: 'n1' } }) as never, res as never);
      assert.equal(res.statusCode, 409);
    });
  });

  describe('handlePublishNewsPost', () => {
    it('publishes post on success', async () => {
      mocks.publishNewsPost.mockResolvedValue({ id: 'n1', slug: 'slug', status: 'published' });
      mocks.invalidateNewsCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handlePublishNewsPost(mockReq({ params: { id: 'n1' } }) as never, res as never);
      assert.deepEqual(res.body, { id: 'n1', slug: 'slug', status: 'published' });
    });

    it('returns 400 when post not found or not draft', async () => {
      mocks.publishNewsPost.mockRejectedValue(new Error('News post not found'));
      const res = mockRes();
      await handlePublishNewsPost(mockReq({ params: { id: 'n1' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleTranslateNewsPost', () => {
    it('returns 501 not implemented', () => {
      const res = mockRes();
      handleTranslateNewsPost(mockReq() as never, res as never);
      assert.equal(res.statusCode, 501);
    });
  });

  describe('handleListAnnouncementAlerts', () => {
    it('returns alert list', async () => {
      mocks.listAnnouncementAlertsAdmin.mockResolvedValue([{ id: 'a1' }]);
      const res = mockRes();
      await handleListAnnouncementAlerts(mockReq() as never, res as never);
      assert.deepEqual(res.body, [{ id: 'a1' }]);
    });

    it('returns 500 on unexpected error', async () => {
      mocks.listAnnouncementAlertsAdmin.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleListAnnouncementAlerts(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleCreateAnnouncementAlert', () => {
    it('creates alert and returns 201', async () => {
      mocks.createAnnouncementAlert.mockResolvedValue({ id: 'a-new', message: 'Hi' });
      mocks.invalidateAnnouncementCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleCreateAnnouncementAlert(
        mockReq({ body: { message: 'Hi' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 201);
    });

    it('returns 400 when news not published', async () => {
      mocks.createAnnouncementAlert.mockRejectedValue(
        Object.assign(new Error('unpublished'), { code: 'NEWS_NOT_PUBLISHED' })
      );
      const res = mockRes();
      await handleCreateAnnouncementAlert(
        mockReq({ body: { message: 'Hi' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleCreateAnnouncementFromNews', () => {
    it('creates alert from news and returns 201', async () => {
      mocks.createAnnouncementFromNews.mockResolvedValue({ id: 'a-new' });
      mocks.invalidateAnnouncementCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleCreateAnnouncementFromNews(
        mockReq({ params: { newsId: 'news-1' }, body: { message: 'Hi' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 201);
    });

    it('returns 404 when news post not found', async () => {
      mocks.createAnnouncementFromNews.mockRejectedValue(new Error('News post not found'));
      const res = mockRes();
      await handleCreateAnnouncementFromNews(
        mockReq({ params: { newsId: 'news-missing' }, body: { message: 'Hi' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleUpdateAnnouncementAlert', () => {
    it('updates alert on success', async () => {
      mocks.updateAnnouncementAlert.mockResolvedValue({ id: 'a1', message: 'Updated' });
      mocks.invalidateAnnouncementCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdateAnnouncementAlert(
        mockReq({ params: { id: 'a1' }, body: { message: 'Updated' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'a1', message: 'Updated' });
    });

    it('returns 404 when alert not found', async () => {
      mocks.updateAnnouncementAlert.mockRejectedValue(new Error('Announcement alert not found'));
      const res = mockRes();
      await handleUpdateAnnouncementAlert(
        mockReq({ params: { id: 'a1' }, body: { message: 'Updated' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleDeleteAnnouncementAlert', () => {
    it('returns 204 on success', async () => {
      mocks.deleteAnnouncementAlert.mockResolvedValue(undefined);
      mocks.invalidateAnnouncementCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleDeleteAnnouncementAlert(mockReq({ params: { id: 'a1' } }) as never, res as never);
      assert.equal(res.statusCode, 204);
    });

    it('returns 500 on unexpected error', async () => {
      mocks.deleteAnnouncementAlert.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleDeleteAnnouncementAlert(mockReq({ params: { id: 'a1' } }) as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleListAdminPublications', () => {
    it('returns publication list', async () => {
      mocks.listPublicationsAdmin.mockResolvedValue({ items: [{ id: 'p1' }], total: 1 });
      const res = mockRes();
      await handleListAdminPublications(mockReq({ query: {} }) as never, res as never);
      assert.deepEqual(res.body, { items: [{ id: 'p1' }], total: 1 });
    });

    it('returns 400 on invalid query', async () => {
      const res = mockRes();
      await handleListAdminPublications(mockReq({ query: { limit: '0' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleUnpublishPublicationAdmin', () => {
    it('unpublishes publication on success', async () => {
      mocks.unpublishPublicationAdmin.mockResolvedValue(true);
      mocks.invalidatePublicationCaches.mockResolvedValue(undefined);
      mocks.invalidatePublicationListCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUnpublishPublicationAdmin(
        mockReq({ params: { id: 'pub-1' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { ok: true });
    });

    it('returns 404 when publication missing', async () => {
      mocks.unpublishPublicationAdmin.mockResolvedValue(false);
      const res = mockRes();
      await handleUnpublishPublicationAdmin(
        mockReq({ params: { id: 'pub-missing' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleListAdminProjects', () => {
    it('returns project list', async () => {
      mocks.listProjectsAdmin.mockResolvedValue({ items: [{ id: 'proj-1' }], total: 1 });
      const res = mockRes();
      await handleListAdminProjects(mockReq({ query: {} }) as never, res as never);
      assert.deepEqual(res.body, { items: [{ id: 'proj-1' }], total: 1 });
    });

    it('returns 400 on invalid query', async () => {
      const res = mockRes();
      await handleListAdminProjects(mockReq({ query: { limit: '0' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleUnpublishProjectAdmin', () => {
    it('unpublishes project on success', async () => {
      mocks.unpublishProjectAdmin.mockResolvedValue({
        publicationId: 'pub-1',
        slug: 'novel-slug',
      });
      mocks.invalidatePublicationCaches.mockResolvedValue(undefined);
      mocks.invalidatePublicationListCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUnpublishProjectAdmin(
        mockReq({ params: { id: 'proj-1' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { ok: true });
    });

    it('returns 404 when project missing', async () => {
      mocks.unpublishProjectAdmin.mockResolvedValue(null);
      const res = mockRes();
      await handleUnpublishProjectAdmin(
        mockReq({ params: { id: 'proj-missing' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleDeleteProjectAdmin', () => {
    it('deletes project on success', async () => {
      mocks.deleteProjectAdmin.mockResolvedValue({
        deleted: true,
        userId: 'user-1',
        publicationId: 'pub-1',
        publicationSlug: 'slug',
      });
      mocks.invalidateUserProjectCaches.mockResolvedValue(undefined);
      mocks.invalidatePublicationCaches.mockResolvedValue(undefined);
      mocks.invalidatePublicationListCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleDeleteProjectAdmin(mockReq({ params: { id: 'proj-1' } }) as never, res as never);
      assert.deepEqual(res.body, { ok: true });
    });

    it('returns 404 when project missing', async () => {
      mocks.deleteProjectAdmin.mockResolvedValue({ deleted: false });
      const res = mockRes();
      await handleDeleteProjectAdmin(
        mockReq({ params: { id: 'proj-missing' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleListAdminUsers', () => {
    it('returns user list', async () => {
      mocks.listUsersAdmin.mockResolvedValue({ items: [{ id: 'u1' }], total: 1 });
      const res = mockRes();
      await handleListAdminUsers(mockReq({ query: {} }) as never, res as never);
      assert.deepEqual(res.body, { items: [{ id: 'u1' }], total: 1 });
    });

    it('returns 400 on invalid query', async () => {
      const res = mockRes();
      await handleListAdminUsers(mockReq({ query: { limit: '0' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleUpdateUserRoleAdmin', () => {
    it('returns 400 when demoting own admin role', async () => {
      mockProfileLookup('admin');
      const res = mockRes();
      await handleUpdateUserRoleAdmin(
        mockReq({ params: { id: 'admin-1' }, body: { role: 'author' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'Cannot demote your own admin role' });
    });

    it('updates role and invalidates profile cache', async () => {
      mockProfileLookup('reader');
      mocks.updateUserRoleAdmin.mockResolvedValue({ id: 'user-2', role: 'author' });
      mocks.redisDelMany.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdateUserRoleAdmin(
        mockReq({ params: { id: 'user-2' }, body: { role: 'author' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'user-2', role: 'author' });
      assert.equal(mocks.invalidateProfileCache.mock.calls[0]?.[0], 'user-2');
    });

    it('returns 400 when removing last admin', async () => {
      mockProfileLookup('admin');
      mocks.countAdminUsersWithRole.mockResolvedValue(1);
      const res = mockRes();
      await handleUpdateUserRoleAdmin(
        mockReq({ params: { id: 'admin-2' }, body: { role: 'author' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'Cannot remove the last admin' });
    });

    it('returns 404 when user not found', async () => {
      const single = vi.fn().mockResolvedValue({ data: null, error: null });
      const eq = vi.fn().mockReturnValue({ single });
      const select = vi.fn().mockReturnValue({ eq });
      mocks.createServiceRoleClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });
      const res = mockRes();
      await handleUpdateUserRoleAdmin(
        mockReq({ params: { id: 'missing' }, body: { role: 'author' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleListAdminTranslationRequests', () => {
    it('returns translation request list', async () => {
      mocks.listCatalogTranslationRequestsAdmin.mockResolvedValue({
        items: [{ id: 'tr-1' }],
        total: 1,
      });
      const res = mockRes();
      await handleListAdminTranslationRequests(mockReq({ query: {} }) as never, res as never);
      assert.deepEqual(res.body, { items: [{ id: 'tr-1' }], total: 1 });
    });

    it('returns 400 on invalid query', async () => {
      const res = mockRes();
      await handleListAdminTranslationRequests(
        mockReq({ query: { limit: '0' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleUpdateAdminTranslationRequest', () => {
    it('updates request on success', async () => {
      mocks.updateCatalogTranslationRequestAdmin.mockResolvedValue({
        id: 'tr-1',
        status: 'reviewed',
      });
      const res = mockRes();
      await handleUpdateAdminTranslationRequest(
        mockReq({ params: { id: 'tr-1' }, body: { status: 'reviewed' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'tr-1', status: 'reviewed' });
    });

    it('returns 404 when request missing', async () => {
      mocks.updateCatalogTranslationRequestAdmin.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateAdminTranslationRequest(
        mockReq({ params: { id: 'tr-missing' }, body: { status: 'reviewed' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleDeleteAdminTranslationRequest', () => {
    it('returns 204 on success', async () => {
      mocks.deleteCatalogTranslationRequestAdmin.mockResolvedValue(true);
      const res = mockRes();
      await handleDeleteAdminTranslationRequest(
        mockReq({ params: { id: 'tr-1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 204);
    });

    it('returns 409 when delete forbidden', async () => {
      mocks.deleteCatalogTranslationRequestAdmin.mockRejectedValue(
        Object.assign(new Error('forbidden'), { code: 'DELETE_FORBIDDEN' })
      );
      const res = mockRes();
      await handleDeleteAdminTranslationRequest(
        mockReq({ params: { id: 'tr-1' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 409);
    });

    it('returns 404 when request missing', async () => {
      mocks.deleteCatalogTranslationRequestAdmin.mockResolvedValue(false);
      const res = mockRes();
      await handleDeleteAdminTranslationRequest(
        mockReq({ params: { id: 'tr-missing' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });
});
