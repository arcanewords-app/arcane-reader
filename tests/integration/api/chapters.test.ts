import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  createChaptersDomainOverlay,
  createProjectsDomainOverlay,
  getSupabaseMock,
  resetMocks,
} from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleChapter } from '../helpers/fixtures.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/chapters.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createChaptersDomainOverlay() };
});

const CHAPTER_PATH = '/api/projects/proj-1/chapters/ch-1';

describe('GET /api/projects/:projectId/chapters/:chapterId (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get(CHAPTER_PATH);

    expect(res.status).toBe(401);
  });

  it('returns 403 for role user on requireRole(author)', async () => {
    const res = await request(app)
      .get(CHAPTER_PATH)
      .set('Authorization', 'Bearer tok')
      .set('X-Test-Role', 'user');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden: insufficient role' });
  });

  it('returns 200 chapter JSON for author when found', async () => {
    const chapter = sampleChapter();
    getSupabaseMock('verifyChapterAccess').mockResolvedValue(true);
    getSupabaseMock('getChapter').mockResolvedValue(chapter);

    const res = await request(app)
      .get(CHAPTER_PATH)
      .set('Authorization', 'Bearer tok')
      .set('X-Test-Role', 'author');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'ch-1', title: 'Chapter 1' });
  });

  it('returns 404 when chapter not found / no access', async () => {
    getSupabaseMock('verifyChapterAccess').mockResolvedValue(false);

    const res = await request(app)
      .get(CHAPTER_PATH)
      .set('Authorization', 'Bearer tok');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Chapter not found' });
  });

  it('returns 404 for foreign project (BOLA via verifyChapterAccess)', async () => {
    getSupabaseMock('verifyChapterAccess').mockResolvedValue(false);

    const res = await request(app)
      .get('/api/projects/other-proj/chapters/ch-1')
      .set('Authorization', 'Bearer tok');

    expect(res.status).toBe(404);
    expect(getSupabaseMock('getChapter')).not.toHaveBeenCalled();
  });
});
