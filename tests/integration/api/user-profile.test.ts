import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  installSupabaseClientMocks,
  resetSupabaseClientMocks,
  supabaseClientMocks,
} from '../helpers/mockSupabaseClient.js';
import { installTokenLimitMocks, resetTokenLimitMocks, tokenLimitMocks } from '../helpers/mockTokenLimits.js';
import { bootTestApp } from '../helpers/createTestApp.js';

vi.mock('../../../src/middleware/auth.js', () =>
  installAuthMocks({ defaultRole: 'author', defaultEmail: 'author@example.com' })
);
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabaseClient.js', () => installSupabaseClientMocks());
vi.mock('../../../src/middleware/tokenLimits.js', () => installTokenLimitMocks());

describe('user profile API (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetSupabaseClientMocks();
    resetTokenLimitMocks();
  });

  describe('GET /api/user/profile', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/user/profile');

      expect(res.status).toBe(401);
    });

    it('returns profile from auth context', async () => {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', 'Bearer tok')
        .set('X-Test-Role', 'author');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'test-user-id',
        email: 'author@example.com',
        role: 'author',
        avatarUrl: null,
      });
    });
  });

  describe('PUT /api/user/profile', () => {
    it('returns 400 when avatarUrl is invalid', async () => {
      const res = await request(app)
        .put('/api/user/profile')
        .set('Authorization', 'Bearer tok')
        .send({ avatarUrl: 'not-a-url' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'Validation failed' });
      expect(supabaseClientMocks.createClientWithToken).not.toHaveBeenCalled();
    });

    it('updates avatarUrl via Supabase client', async () => {
      supabaseClientMocks.single.mockResolvedValue({
        data: { avatar_url: 'https://cdn.example/avatar.png' },
        error: null,
      });

      const res = await request(app)
        .put('/api/user/profile')
        .set('Authorization', 'Bearer tok')
        .send({ avatarUrl: 'https://cdn.example/avatar.png' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ avatarUrl: 'https://cdn.example/avatar.png' });
      expect(supabaseClientMocks.createClientWithToken).toHaveBeenCalledWith('tok');
    });
  });

  describe('GET /api/user/token-usage', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/user/token-usage');

      expect(res.status).toBe(401);
    });

    it('returns token usage for authenticated user', async () => {
      tokenLimitMocks.getUserTokenUsage.mockResolvedValue({
        date: '2026-08-02',
        tokensUsed: 1200,
        tokensBlocked: 0,
        tokensLimit: 1_000_000,
        tokensRemaining: 998_800,
        percentageUsed: 0.12,
        warning: false,
      });

      const res = await request(app)
        .get('/api/user/token-usage')
        .set('Authorization', 'Bearer tok')
        .query({ date: '2026-08-02' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ tokensUsed: 1200, tokensLimit: 1_000_000 });
      expect(tokenLimitMocks.getUserTokenUsage).toHaveBeenCalledWith(
        'test-user-id',
        'tok',
        '2026-08-02',
        'author'
      );
    });
  });
});
