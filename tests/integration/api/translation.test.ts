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
import { installTokenLimitMocks, resetTokenLimitMocks, tokenLimitMocks } from '../helpers/mockTokenLimits.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleChapter, sampleProject } from '../helpers/fixtures.js';

const performTranslation = vi.fn().mockResolvedValue(undefined);
const isBullAvailable = vi.fn(() => false);

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/middleware/tokenLimits.js', () => installTokenLimitMocks());
vi.mock('../../../src/api/chapterTranslation.js', () => ({
  performTranslation: (...args: unknown[]) => performTranslation(...args),
}));
vi.mock('../../../src/services/cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches: vi.fn().mockResolvedValue(undefined),
  invalidateUserProjectCaches: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/services/chapterQueue.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    isBullAvailable: () => isBullAvailable(),
  };
});
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/chapters.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createChaptersDomainOverlay() };
});

const TRANSLATE_PATH = '/api/projects/proj-1/chapters/ch-1/translate';
const CANCEL_PATH = '/api/projects/proj-1/chapters/ch-1/translate/cancel';
const BATCH_PATH = '/api/projects/proj-1/chapters/translate-batch';

function stubHappyTranslate() {
  getSupabaseMock('getProject').mockResolvedValue(sampleProject());
  getSupabaseMock('getChapter').mockResolvedValue(sampleChapter());
  getSupabaseMock('updateChapter').mockResolvedValue(true);
}

describe('translation wiring (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
    resetTokenLimitMocks();
    performTranslation.mockReset();
    performTranslation.mockResolvedValue(undefined);
    isBullAvailable.mockReset();
    isBullAvailable.mockReturnValue(false);
    stubHappyTranslate();
  });

  it('valid body sync start → 200 status started', async () => {
    const res = await request(app)
      .post(TRANSLATE_PATH)
      .set('Authorization', 'Bearer tok')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'started', chapterId: 'ch-1' });
    expect(performTranslation).toHaveBeenCalled();
  });

  it('invalid body → 400 Zod', async () => {
    const res = await request(app)
      .post(TRANSLATE_PATH)
      .set('Authorization', 'Bearer tok')
      .send({ stages: 'nope' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('chapter already translating → 409', async () => {
    getSupabaseMock('getChapter').mockResolvedValue(sampleChapter({ status: 'translating' }));

    const res = await request(app)
      .post(TRANSLATE_PATH)
      .set('Authorization', 'Bearer tok')
      .send({});

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'ALREADY_RUNNING' });
  });

  it('token limit exceeded → 429', async () => {
    tokenLimitMocks.checkTokenLimit.mockResolvedValue({
      allowed: false,
      currentUsage: 1000,
      limit: 1000,
      remaining: 0,
      warning: true,
      message: 'Token limit exceeded',
    });

    const res = await request(app)
      .post(TRANSLATE_PATH)
      .set('Authorization', 'Bearer tok')
      .send({});

    expect(res.status).toBe(429);
  });

  it('async batch when Bull unavailable → 503', async () => {
    isBullAvailable.mockReturnValue(false);

    const res = await request(app)
      .post(`${BATCH_PATH}?async=1`)
      .set('Authorization', 'Bearer tok')
      .send({ chapterIds: ['ch-1'] });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'Job queue unavailable' });
  });

  it('cancel endpoint → 200 success when translating', async () => {
    getSupabaseMock('getChapter').mockResolvedValue(sampleChapter({ status: 'translating' }));

    const res = await request(app)
      .post(CANCEL_PATH)
      .set('Authorization', 'Bearer tok')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});
