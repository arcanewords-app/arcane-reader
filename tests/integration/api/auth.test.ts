import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  authServiceMocks,
  installAuthServiceMocks,
  resetAuthServiceMocks,
} from '../helpers/mockAuthService.js';
import { bootTestApp } from '../helpers/createTestApp.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks());
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/authService.js', () => installAuthServiceMocks());

describe('auth API (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetAuthServiceMocks();
  });

  it('login valid body → 200 with user/session shape', async () => {
    authServiceMocks.login.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      role: 'author',
    });
    authServiceMocks.getSession.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: 123,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'password1' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'u1', email: 'a@b.com' });
    expect(res.body.session).toMatchObject({
      access_token: 'access',
      refresh_token: 'refresh',
    });
  });

  it('login service throws invalid creds → 401', async () => {
    authServiceMocks.login.mockRejectedValue(new Error('Invalid login credentials'));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'wrong-pass' });

    expect(res.status).toBe(401);
  });

  it('refresh missing token → 400 Zod', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(res.body).toHaveProperty('details');
  });

  it('refresh valid → 200 with new tokens', async () => {
    authServiceMocks.refreshSession.mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_at: 999,
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: 'old-refresh' });

    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    });
  });

  it('GET /api/auth/me without Bearer → 401', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Not authenticated' });
  });

  it('GET /api/auth/me with token → 200 user', async () => {
    authServiceMocks.getUserByToken.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      role: 'author',
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer stub-token');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'u1', email: 'a@b.com' });
  });
});
