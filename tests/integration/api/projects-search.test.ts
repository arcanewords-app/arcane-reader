import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  createParagraphsDomainOverlay,
  createProjectsDomainOverlay,
  getSupabaseMock,
  resetMocks,
} from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleProject } from '../helpers/fixtures.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/paragraphs.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createParagraphsDomainOverlay() };
});

const SEARCH_PATH = '/api/projects/proj-1/search';

describe('GET /api/projects/:id/search (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get(SEARCH_PATH).query({ q: 'hello' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when limit exceeds max', async () => {
    getSupabaseMock('getProject').mockResolvedValue(sampleProject());

    const res = await request(app)
      .get(SEARCH_PATH)
      .set('Authorization', 'Bearer tok')
      .query({ q: 'hello', limit: 501 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(getSupabaseMock('searchParagraphsInProject')).not.toHaveBeenCalled();
  });

  it('returns 404 when project is missing', async () => {
    getSupabaseMock('getProject').mockResolvedValue(null);

    const res = await request(app)
      .get(SEARCH_PATH)
      .set('Authorization', 'Bearer tok')
      .query({ q: 'hello' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Project not found' });
  });

  it('searches paragraphs in project', async () => {
    getSupabaseMock('getProject').mockResolvedValue(sampleProject());
    getSupabaseMock('searchParagraphsInProject').mockResolvedValue({
      items: [{ chapterId: 'ch-1', paragraphId: 'p-1', snippet: 'hello world' }],
      total: 1,
    });

    const res = await request(app)
      .get(SEARCH_PATH)
      .set('Authorization', 'Bearer tok')
      .query({ q: 'hello', field: 'translated' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1 });
    expect(getSupabaseMock('searchParagraphsInProject')).toHaveBeenCalledWith(
      'proj-1',
      'hello',
      'translated',
      'tok',
      expect.objectContaining({ offset: 0, limit: 200 })
    );
  });
});
