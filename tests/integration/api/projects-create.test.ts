import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { createProjectsDomainOverlay, getSupabaseMock, resetMocks } from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleProject } from '../helpers/fixtures.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});

const CREATE_PATH = '/api/projects';

describe('POST /api/projects (integration)', () => {
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
      .send({ name: 'New Project', sourceLanguage: 'en', targetLanguage: 'ru' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when body fails Zod validation', async () => {
    const res = await request(app)
      .post(CREATE_PATH)
      .set('Authorization', 'Bearer tok')
      .send({ name: '', sourceLanguage: 'en', targetLanguage: 'ru' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(getSupabaseMock('createProject')).not.toHaveBeenCalled();
  });

  it('creates project for author', async () => {
    const created = sampleProject({ id: 'proj-new', title: 'New Project' });
    getSupabaseMock('createProject').mockResolvedValue(created);

    const res = await request(app)
      .post(CREATE_PATH)
      .set('Authorization', 'Bearer tok')
      .set('X-Test-Role', 'author')
      .send({ name: 'New Project', sourceLanguage: 'en', targetLanguage: 'ru' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'proj-new', title: 'New Project' });
    expect(getSupabaseMock('createProject')).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Project',
        sourceLanguage: 'en',
        targetLanguage: 'ru',
      }),
      'test-user-id',
      'tok'
    );
  });
});
