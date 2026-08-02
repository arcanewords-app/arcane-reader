import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { getSupabaseMock, resetMocks } from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { markSupabaseDown, markSupabaseHealthy } from '../helpers/health.js';
import { samplePublication } from '../helpers/fixtures.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/publications.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { createPublicationsDomainOverlay } = await import('../helpers/mockSupabase.js');
  return { ...actual, ...createPublicationsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { createProjectsDomainOverlay } = await import('../helpers/mockSupabase.js');
  return { ...actual, ...createProjectsDomainOverlay() };
});

describe('health circuit breaker (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
    markSupabaseHealthy();
    getSupabaseMock('getAllProjectsLightweight').mockResolvedValue([]);
    getSupabaseMock('resetStuckChapters').mockResolvedValue(0);
    getSupabaseMock('listPublicationsPublic').mockResolvedValue([samplePublication()]);
  });

  it('allows private route when supabase is healthy (auth stub reaches handler)', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).not.toBe(503);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 503 on private route after reportError(supabase)', async () => {
    markSupabaseDown();

    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      service: 'supabase',
    });
    expect(getSupabaseMock('getAllProjectsLightweight')).not.toHaveBeenCalled();
  });

  it('keeps public publications available while supabase is down', async () => {
    markSupabaseDown();

    const res = await request(app).get('/api/publications');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('keeps /api/status reachable while down (breaker exempt)', async () => {
    markSupabaseDown();

    const statusRes = await request(app).get('/api/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body).toMatchObject({ version: '0.1.0' });
  });

  it('allows private route again after healthy reset', async () => {
    markSupabaseDown();
    markSupabaseHealthy();

    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
  });
});
