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

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks());
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/publications.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createPublicationsDomainOverlay() };
});

describe('GET /api/public/entities (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns entities by ids', async () => {
    const idA = '550e8400-e29b-41d4-a716-446655440001';
    const idB = '550e8400-e29b-41d4-a716-446655440002';
    getSupabaseMock('listPublicEntitiesByIds').mockResolvedValue([
      { id: idA, name: 'Author A', kind: 'author' },
      { id: idB, name: 'Translator B', kind: 'translator' },
    ]);

    const res = await request(app).get('/api/public/entities').query({ ids: `${idA},${idB}` });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(getSupabaseMock('listPublicEntitiesByIds')).toHaveBeenCalledWith([idA, idB]);
  });

  it('returns 400 for invalid ids', async () => {
    const res = await request(app).get('/api/public/entities').query({ ids: 'bad-id' });
    expect(res.status).toBe(400);
    expect(getSupabaseMock('listPublicEntitiesByIds')).not.toHaveBeenCalled();
  });
});
