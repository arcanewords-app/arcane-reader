import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { getSupabaseMock, resetMocks } from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleNewsPost } from '../helpers/fixtures.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks());
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/news.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { createNewsDomainOverlay } = await import('../helpers/mockSupabase.js');
  return { ...actual, ...createNewsDomainOverlay() };
});

describe('GET /api/news (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns 200 with published posts', async () => {
    const post = sampleNewsPost();
    getSupabaseMock('listPublishedNewsPosts').mockResolvedValue([post]);

    const res = await request(app).get('/api/news');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([post]);
  });

  it('returns 404 when post is missing (unpublished/draft not exposed)', async () => {
    getSupabaseMock('getPublishedNewsPostByIdOrSlug').mockResolvedValue(null);

    const res = await request(app).get('/api/news/draft-slug');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'News post not found' });
  });

  it('returns 200 when post is found by slug', async () => {
    const post = sampleNewsPost({ slug: 'hello-wave' });
    getSupabaseMock('getPublishedNewsPostByIdOrSlug').mockResolvedValue(post);

    const res = await request(app).get('/api/news/hello-wave');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: 'hello-wave', title: 'Hello Wave' });
  });

  it('returns 400 for invalid limit query', async () => {
    const res = await request(app).get('/api/news').query({ limit: 999 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(res.body).toHaveProperty('details');
  });
});
