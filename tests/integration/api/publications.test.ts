import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  createPublicationsDomainOverlay,
  getSupabaseMock,
  resetMocks,
} from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { samplePublication } from '../helpers/fixtures.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks());
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/publications.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createPublicationsDomainOverlay() };
});

describe('GET /api/publications (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns 200 with publication list', async () => {
    const pub = samplePublication();
    getSupabaseMock('listPublicationsPublic').mockResolvedValue([pub]);

    const res = await request(app).get('/api/publications');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([pub]);
    expect(getSupabaseMock('listPublicationsPublic')).toHaveBeenCalled();
  });

  it('returns 200 with empty list', async () => {
    getSupabaseMock('listPublicationsPublic').mockResolvedValue([]);

    const res = await request(app).get('/api/publications');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('falls back to defaults when limit query fails Zod (handler contract)', async () => {
    getSupabaseMock('listPublicationsPublic').mockResolvedValue([]);

    const res = await request(app).get('/api/publications').query({ limit: 999 });

    // handleListPublications does not 400 — invalid query uses default params
    expect(res.status).toBe(200);
    expect(getSupabaseMock('listPublicationsPublic')).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 })
    );
  });

  it('returns 500 when domain throws a generic Error', async () => {
    getSupabaseMock('listPublicationsPublic').mockRejectedValue(new Error('boom'));

    const res = await request(app).get('/api/publications');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'boom' });
  });

  it('returns 503 when domain throws a Supabase-like error', async () => {
    getSupabaseMock('listPublicationsPublic').mockRejectedValue(
      new Error('fetch failed: supabase connection refused')
    );

    const res = await request(app).get('/api/publications');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});

describe('GET /api/publications/:id (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns 200 when publication is found', async () => {
    const pub = samplePublication({ id: 'pub-42', slug: 'found' });
    getSupabaseMock('getPublicationBySlugOrId').mockResolvedValue(pub);

    const res = await request(app).get('/api/publications/found');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'pub-42', slug: 'found' });
  });

  it('returns 404 when publication is missing', async () => {
    getSupabaseMock('getPublicationBySlugOrId').mockResolvedValue(null);

    const res = await request(app).get('/api/publications/missing');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Publication not found' });
  });
});
