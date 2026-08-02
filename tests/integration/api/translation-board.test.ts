import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { createCatalogBoardDomainOverlay, getSupabaseMock, resetMocks } from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/catalogBoard.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createCatalogBoardDomainOverlay() };
});

const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440000';
const TRANSLATOR_ENTITY_ID = '6ba7b810-9dad-11d1-80b4-00c04fd42991';

describe('translation request board (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  describe('GET /api/translation-requests/board', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/translation-requests/board');

      expect(res.status).toBe(401);
    });

    it('returns 403 for role user', async () => {
      const res = await request(app)
        .get('/api/translation-requests/board')
        .set('Authorization', 'Bearer tok')
        .set('X-Test-Role', 'user');

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: 'Forbidden: insufficient role' });
    });

    it('lists board items for author', async () => {
      getSupabaseMock('listTranslationRequestsBoard').mockResolvedValue({
        items: [{ id: REQUEST_ID, title: 'Novel A' }],
        total: 1,
      });

      const res = await request(app)
        .get('/api/translation-requests/board')
        .set('Authorization', 'Bearer tok')
        .query({ status: 'pending', limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 1 });
      expect(getSupabaseMock('listTranslationRequestsBoard')).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ status: 'pending', limit: 10 })
      );
    });
  });

  describe('POST /api/translation-requests/:id/interests', () => {
    it('returns 400 when translatorEntityId is missing', async () => {
      const res = await request(app)
        .post(`/api/translation-requests/${REQUEST_ID}/interests`)
        .set('Authorization', 'Bearer tok')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'Validation failed' });
      expect(getSupabaseMock('createTranslationRequestInterest')).not.toHaveBeenCalled();
    });

    it('creates interest for author', async () => {
      const interest = {
        id: 'int-1',
        requestId: REQUEST_ID,
        translatorEntityId: TRANSLATOR_ENTITY_ID,
        status: 'interested',
      };
      getSupabaseMock('createTranslationRequestInterest').mockResolvedValue(interest);

      const res = await request(app)
        .post(`/api/translation-requests/${REQUEST_ID}/interests`)
        .set('Authorization', 'Bearer tok')
        .send({ translatorEntityId: TRANSLATOR_ENTITY_ID });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 'int-1', status: 'interested' });
      expect(getSupabaseMock('createTranslationRequestInterest')).toHaveBeenCalledWith(
        REQUEST_ID,
        'test-user-id',
        'tok',
        TRANSLATOR_ENTITY_ID
      );
    });
  });

  describe('PATCH /api/translation-requests/:id/interests/me', () => {
    it('updates own interest', async () => {
      const updated = {
        id: 'int-1',
        requestId: REQUEST_ID,
        status: 'working',
      };
      getSupabaseMock('updateTranslationRequestInterestMe').mockResolvedValue(updated);

      const res = await request(app)
        .patch(`/api/translation-requests/${REQUEST_ID}/interests/me`)
        .set('Authorization', 'Bearer tok')
        .send({ status: 'working' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'working' });
      expect(getSupabaseMock('updateTranslationRequestInterestMe')).toHaveBeenCalledWith(
        REQUEST_ID,
        'test-user-id',
        'tok',
        { status: 'working' }
      );
    });
  });
});
