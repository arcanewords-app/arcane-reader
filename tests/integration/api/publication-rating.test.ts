import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  createPublicationRatingsDomainOverlay,
  createPublicationsDomainOverlay,
  createReaderProgressDomainOverlay,
  getSupabaseMock,
  resetMocks,
} from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { samplePublication } from '../helpers/fixtures.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'user' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/publications.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createPublicationsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/publicationRatings.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createPublicationRatingsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/readerProgress.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createReaderProgressDomainOverlay() };
});

describe('PUT /api/publications/:id/rating (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).put('/api/publications/sample-pub/rating').send({ score: 4 });

    expect(res.status).toBe(401);
  });

  it('returns 400 when score is invalid', async () => {
    getSupabaseMock('getPublicationBySlugOrId').mockResolvedValue(samplePublication());

    const res = await request(app)
      .put('/api/publications/sample-pub/rating')
      .set('Authorization', 'Bearer tok')
      .send({ score: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(getSupabaseMock('upsertPublicationRating')).not.toHaveBeenCalled();
  });

  it('returns 404 when publication is missing', async () => {
    getSupabaseMock('getPublicationBySlugOrId').mockResolvedValue(null);

    const res = await request(app)
      .put('/api/publications/missing/rating')
      .set('Authorization', 'Bearer tok')
      .send({ score: 4 });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Publication not found' });
  });

  it('upserts rating for authenticated user', async () => {
    const pub = samplePublication();
    getSupabaseMock('getPublicationBySlugOrId').mockResolvedValue(pub);
    getSupabaseMock('upsertPublicationRating').mockResolvedValue({
      score: 4,
      average: 4,
      count: 1,
    });

    const res = await request(app)
      .put('/api/publications/sample-pub/rating')
      .set('Authorization', 'Bearer tok')
      .send({ score: 4 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ score: 4 });
    expect(getSupabaseMock('upsertPublicationRating')).toHaveBeenCalledWith(
      'pub-1',
      'test-user-id',
      4,
      'tok'
    );
  });
});

describe('PATCH /api/publications/:id/read-progress (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns 400 when body fails Zod validation', async () => {
    getSupabaseMock('getPublicationBySlugOrId').mockResolvedValue(samplePublication());

    const res = await request(app)
      .patch('/api/publications/sample-pub/read-progress')
      .set('Authorization', 'Bearer tok')
      .send({ chapterNumber: 1, mode: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
  });

  it('updates read progress watermark', async () => {
    const pub = samplePublication();
    getSupabaseMock('getPublicationBySlugOrId').mockResolvedValue(pub);
    getSupabaseMock('updateReadProgress').mockResolvedValue({ lastReadChapterNumber: 3 });

    const res = await request(app)
      .patch('/api/publications/sample-pub/read-progress')
      .set('Authorization', 'Bearer tok')
      .send({ chapterNumber: 3, mode: 'complete' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lastReadChapterNumber: 3 });
    expect(getSupabaseMock('updateReadProgress')).toHaveBeenCalledWith(
      'test-user-id',
      'pub-1',
      3,
      'complete',
      'tok'
    );
  });
});
