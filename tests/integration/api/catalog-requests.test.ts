import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { createCatalogBoardDomainOverlay, getSupabaseMock, resetMocks } from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'user' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/catalogBoard.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createCatalogBoardDomainOverlay() };
});

const CREATE_PATH = '/api/catalog/translation-requests';

describe('POST /api/catalog/translation-requests (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post(CREATE_PATH)
      .send({ title: 'New Novel', targetLanguage: 'ru' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when title is too short', async () => {
    const res = await request(app)
      .post(CREATE_PATH)
      .set('Authorization', 'Bearer tok')
      .send({ title: 'A', targetLanguage: 'ru' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(getSupabaseMock('createCatalogTranslationRequest')).not.toHaveBeenCalled();
  });

  it('creates catalog translation request', async () => {
    const created = {
      id: 'req-1',
      title: 'New Novel',
      targetLanguage: 'ru',
      status: 'pending',
    };
    getSupabaseMock('createCatalogTranslationRequest').mockResolvedValue(created);

    const res = await request(app)
      .post(CREATE_PATH)
      .set('Authorization', 'Bearer tok')
      .send({
        title: 'New Novel',
        sourceLanguage: 'en',
        targetLanguage: 'ru',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'req-1', title: 'New Novel' });
    expect(getSupabaseMock('createCatalogTranslationRequest')).toHaveBeenCalledWith(
      'test-user-id',
      'tok',
      expect.objectContaining({
        title: 'New Novel',
        sourceLanguage: 'en',
        targetLanguage: 'ru',
      })
    );
  });
});
