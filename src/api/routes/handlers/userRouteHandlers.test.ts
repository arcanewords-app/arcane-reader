import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import {
  TRANSLATOR_PSEUDONYM_LIMIT_CODE,
  createPseudonymLimitError,
} from '../../../shared/translatorPseudonyms.js';

const mocks = vi.hoisted(() => ({
  getUserReaderSettings: vi.fn(),
  updateUserReaderSettings: vi.fn(),
  getUserReadingHistory: vi.fn(),
  createCatalogTranslationRequest: vi.fn(),
  listCatalogTranslationRequestsByUser: vi.fn(),
  listTranslatorPseudonymsForUser: vi.fn(),
  createTranslatorPseudonymForUser: vi.fn(),
  updateTranslatorPseudonymForUser: vi.fn(),
  hideTranslatorPseudonymForUser: vi.fn(),
  getTranslatorPseudonymForUser: vi.fn(),
  getUserTokenUsage: vi.fn(),
  getTokenUsageHistory: vi.fn(),
  withRedisCache: vi.fn((_key: string, _ttl: number, fn: () => unknown) => fn()),
  invalidatePublicEntitiesCaches: vi.fn(),
  handleServiceError: vi.fn(() => false),
  createClientWithToken: vi.fn(),
  redisDelMany: vi.fn(),
  invalidateProfileCache: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  generateUniqueFilename: vi.fn(),
}));

vi.mock('../../../services/supabaseDatabase.js', () => ({
  getUserReaderSettings: mocks.getUserReaderSettings,
  updateUserReaderSettings: mocks.updateUserReaderSettings,
  getUserReadingHistory: mocks.getUserReadingHistory,
  createCatalogTranslationRequest: (...args: unknown[]) =>
    mocks.createCatalogTranslationRequest(...args),
  listCatalogTranslationRequestsByUser: (...args: unknown[]) =>
    mocks.listCatalogTranslationRequestsByUser(...args),
  listTranslatorPseudonymsForUser: (...args: unknown[]) =>
    mocks.listTranslatorPseudonymsForUser(...args),
  createTranslatorPseudonymForUser: (...args: unknown[]) =>
    mocks.createTranslatorPseudonymForUser(...args),
  updateTranslatorPseudonymForUser: (...args: unknown[]) =>
    mocks.updateTranslatorPseudonymForUser(...args),
  hideTranslatorPseudonymForUser: (...args: unknown[]) =>
    mocks.hideTranslatorPseudonymForUser(...args),
  getTranslatorPseudonymForUser: (...args: unknown[]) =>
    mocks.getTranslatorPseudonymForUser(...args),
}));

vi.mock('../../../middleware/serviceHealth.js', () => ({
  handleServiceError: mocks.handleServiceError,
}));

vi.mock('../../../middleware/tokenLimits.js', () => ({
  getUserTokenUsage: mocks.getUserTokenUsage,
  getTokenUsageHistory: mocks.getTokenUsageHistory,
}));

vi.mock('../../routeHelpers.js', () => ({
  withRedisCache: mocks.withRedisCache,
  tokenUsageCacheKey: (userId: string, date: string) => `token-usage:${userId}:${date}`,
  tokenUsageHistoryCacheKey: (userId: string, days: number) => `token-history:${userId}:${days}`,
  readingHistoryCacheKey: (userId: string) => `reading-history:${userId}`,
  invalidatePublicEntitiesCaches: (...args: unknown[]) =>
    mocks.invalidatePublicEntitiesCaches(...args),
}));

vi.mock('../../../services/redisCache.js', () => ({
  buildRedisKey: (prefix: string, id: string) => `${prefix}:${id}`,
  redisDelMany: mocks.redisDelMany,
}));

vi.mock('../../../middleware/auth.js', () => ({
  invalidateProfileCache: mocks.invalidateProfileCache,
}));

vi.mock('../../../services/storage.js', () => ({
  uploadFile: mocks.uploadFile,
  deleteFile: mocks.deleteFile,
  generateUniqueFilename: mocks.generateUniqueFilename,
}));

vi.mock('../../../services/supabaseClient.js', () => ({
  createClientWithToken: mocks.createClientWithToken,
}));

import {
  handleGetTokenUsage,
  handleGetTokenUsageHistory,
  handleGetReadingHistory,
  handleCreateCatalogTranslationRequest,
  handleListUserTranslationRequests,
  handleGetProfile,
  handleUpdateProfile,
  handleUploadProfileAvatar,
  handleGetUserReaderSettings,
  handleUpdateUserReaderSettings,
  handleListTranslatorPseudonyms,
  handleCreateTranslatorPseudonym,
  handleUpdateTranslatorPseudonym,
  handleHideTranslatorPseudonym,
} from './userRouteHandlers.js';

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
    user: {
      id: 'user-1',
      email: 'user@example.com',
      role: 'author' as const,
      avatarUrl: null,
    },
    token: 'bearer-token',
    params: { id: 'pseudo-1' },
    body: {},
    query: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
}

function mockSupabaseProfileUpdate(avatarUrl: string | null, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: { avatar_url: avatarUrl }, error });
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  mocks.createClientWithToken.mockReturnValue({ from: vi.fn().mockReturnValue({ update }) });
}

describe('userRouteHandlers', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.handleServiceError.mockReturnValue(false);
    mocks.withRedisCache.mockImplementation((_k, _t, fn) => fn());
  });

  describe('handleGetTokenUsage', () => {
    it('returns token usage on success', async () => {
      mocks.getUserTokenUsage.mockResolvedValue({ used: 100, limit: 1000 });
      const res = mockRes();
      await handleGetTokenUsage(mockReq({ query: { date: '2026-07-12' } }) as never, res as never);
      assert.deepEqual(res.body, { used: 100, limit: 1000 });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetTokenUsage(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });

    it('returns 500 on unexpected error', async () => {
      mocks.getUserTokenUsage.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleGetTokenUsage(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleGetTokenUsageHistory', () => {
    it('returns history wrapped in object', async () => {
      mocks.getTokenUsageHistory.mockResolvedValue([{ date: '2026-07-12', used: 50 }]);
      const res = mockRes();
      await handleGetTokenUsageHistory(mockReq({ query: { days: '14' } }) as never, res as never);
      assert.deepEqual(res.body, { history: [{ date: '2026-07-12', used: 50 }] });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetTokenUsageHistory(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleGetReadingHistory', () => {
    it('returns reading history items', async () => {
      mocks.getUserReadingHistory.mockResolvedValue([{ publicationId: 'pub-1' }]);
      const res = mockRes();
      await handleGetReadingHistory(mockReq() as never, res as never);
      assert.deepEqual(res.body, { items: [{ publicationId: 'pub-1' }] });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetReadingHistory(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleCreateCatalogTranslationRequest', () => {
    it('creates request and returns 201', async () => {
      mocks.createCatalogTranslationRequest.mockResolvedValue({ id: 'tr-1', title: 'Novel' });
      const res = mockRes();
      await handleCreateCatalogTranslationRequest(
        mockReq({ body: { title: 'Novel', targetLanguage: 'ru' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 201);
      assert.deepEqual(res.body, { id: 'tr-1', title: 'Novel' });
    });

    it('returns 409 when pending limit reached', async () => {
      mocks.createCatalogTranslationRequest.mockRejectedValue(
        Object.assign(new Error('limit'), { code: 'PENDING_LIMIT' })
      );
      const res = mockRes();
      await handleCreateCatalogTranslationRequest(
        mockReq({ body: { title: 'Novel', targetLanguage: 'ru' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 409);
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleCreateCatalogTranslationRequest(
        mockReq({ body: { title: '', targetLanguage: 'ru' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleListUserTranslationRequests', () => {
    it('returns user translation requests', async () => {
      mocks.listCatalogTranslationRequestsByUser.mockResolvedValue([{ id: 'tr-1' }]);
      const res = mockRes();
      await handleListUserTranslationRequests(mockReq() as never, res as never);
      assert.deepEqual(res.body, [{ id: 'tr-1' }]);
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleListUserTranslationRequests(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleGetProfile', () => {
    it('returns user profile fields', async () => {
      const res = mockRes();
      await handleGetProfile(mockReq() as never, res as never);
      assert.deepEqual(res.body, {
        id: 'user-1',
        email: 'user@example.com',
        role: 'author',
        avatarUrl: null,
      });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetProfile(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleUpdateProfile', () => {
    it('updates avatar and invalidates cache', async () => {
      mockSupabaseProfileUpdate('https://cdn/a.jpg');
      mocks.redisDelMany.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdateProfile(
        mockReq({ body: { avatarUrl: 'https://cdn/a.jpg' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { avatarUrl: 'https://cdn/a.jpg' });
      assert.equal(mocks.invalidateProfileCache.mock.calls[0]?.[0], 'user-1');
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleUpdateProfile(
        mockReq({ body: { avatarUrl: 'not-a-url' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 500 when supabase update fails', async () => {
      mockSupabaseProfileUpdate(null, { message: 'db error' });
      const res = mockRes();
      await handleUpdateProfile(
        mockReq({ body: { avatarUrl: 'https://cdn/a.jpg' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 500);
    });
  });

  describe('handleUploadProfileAvatar', () => {
    it('uploads avatar and updates profile', async () => {
      mocks.uploadFile.mockResolvedValue({ publicUrl: 'https://cdn/avatar.jpg' });
      mockSupabaseProfileUpdate('https://cdn/avatar.jpg');
      mocks.redisDelMany.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUploadProfileAvatar(
        mockReq({
          file: { buffer: Buffer.from('img'), mimetype: 'image/jpeg', originalname: 'avatar.jpg' },
        }) as never,
        res as never
      );
      assert.deepEqual(res.body, { avatarUrl: 'https://cdn/avatar.jpg' });
    });

    it('returns 400 when no file uploaded', async () => {
      const res = mockRes();
      await handleUploadProfileAvatar(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleUploadProfileAvatar(
        mockReq({
          user: undefined,
          file: { buffer: Buffer.from('img'), mimetype: 'image/jpeg', originalname: 'avatar.jpg' },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleGetUserReaderSettings', () => {
    it('returns reader settings when present', async () => {
      mocks.getUserReaderSettings.mockResolvedValue({ fontSize: 16 });
      const res = mockRes();
      await handleGetUserReaderSettings(mockReq() as never, res as never);
      assert.deepEqual(res.body, { fontSize: 16 });
    });

    it('returns null when settings missing', async () => {
      mocks.getUserReaderSettings.mockResolvedValue(null);
      const res = mockRes();
      await handleGetUserReaderSettings(mockReq() as never, res as never);
      assert.equal(res.body, null);
    });
  });

  describe('handleUpdateUserReaderSettings', () => {
    it('updates reader settings on success', async () => {
      mocks.updateUserReaderSettings.mockResolvedValue({ fontSize: 18 });
      const res = mockRes();
      await handleUpdateUserReaderSettings(
        mockReq({ body: { fontSize: 18 } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { fontSize: 18 });
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleUpdateUserReaderSettings(
        mockReq({ user: undefined, body: { fontSize: 18 } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleListTranslatorPseudonyms', () => {
    it('returns pseudonym list', async () => {
      mocks.listTranslatorPseudonymsForUser.mockResolvedValue([{ id: 'p1', name: 'Alias' }]);
      const res = mockRes();
      await handleListTranslatorPseudonyms(mockReq() as never, res as never);
      assert.deepEqual(res.body, [{ id: 'p1', name: 'Alias' }]);
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleListTranslatorPseudonyms(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleCreateTranslatorPseudonym', () => {
    it('creates pseudonym and returns 201', async () => {
      mocks.createTranslatorPseudonymForUser.mockResolvedValue({ id: 'p-new', name: 'New Alias' });
      mocks.invalidatePublicEntitiesCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleCreateTranslatorPseudonym(
        mockReq({ body: { name: 'New Alias', description: 'Bio' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 201);
      assert.deepEqual(res.body, { id: 'p-new', name: 'New Alias' });
    });

    it('returns 400 on validation failure', async () => {
      const res = mockRes();
      await handleCreateTranslatorPseudonym(mockReq({ body: { name: '' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 409 when pseudonym limit reached', async () => {
      mocks.createTranslatorPseudonymForUser.mockRejectedValue(createPseudonymLimitError(3));
      const res = mockRes();
      await handleCreateTranslatorPseudonym(
        mockReq({ body: { name: 'Alias', description: 'Bio' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 409);
      assert.equal((res.body as { code: string }).code, TRANSLATOR_PSEUDONYM_LIMIT_CODE);
    });
  });

  describe('handleUpdateTranslatorPseudonym', () => {
    it('updates pseudonym on success', async () => {
      mocks.getTranslatorPseudonymForUser.mockResolvedValue({ id: 'pseudo-1', name: 'Old' });
      mocks.updateTranslatorPseudonymForUser.mockResolvedValue({ id: 'pseudo-1', name: 'New' });
      mocks.invalidatePublicEntitiesCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdateTranslatorPseudonym(
        mockReq({ body: { name: 'New' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'pseudo-1', name: 'New' });
    });

    it('returns 404 when pseudonym not found', async () => {
      mocks.getTranslatorPseudonymForUser.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateTranslatorPseudonym(
        mockReq({ body: { name: 'New' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleHideTranslatorPseudonym', () => {
    it('hides pseudonym and invalidates cache', async () => {
      mocks.hideTranslatorPseudonymForUser.mockResolvedValue({ id: 'pseudo-1', hidden: true });
      mocks.invalidatePublicEntitiesCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleHideTranslatorPseudonym(mockReq() as never, res as never);
      assert.deepEqual(res.body, { id: 'pseudo-1', hidden: true });
      assert.equal(mocks.invalidatePublicEntitiesCaches.mock.calls[0]?.[0], 'pseudo-1');
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleHideTranslatorPseudonym(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });
});
