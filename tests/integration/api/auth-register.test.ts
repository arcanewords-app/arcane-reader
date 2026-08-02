import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  authServiceMocks,
  installAuthServiceMocks,
  resetAuthServiceMocks,
} from '../helpers/mockAuthService.js';
import { bootTestApp } from '../helpers/createTestApp.js';

vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/authService.js', () => installAuthServiceMocks());

describe('POST /api/auth/register (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetAuthServiceMocks();
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password1' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(authServiceMocks.register).not.toHaveBeenCalled();
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: '12345' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(authServiceMocks.register).not.toHaveBeenCalled();
  });

  it('returns 400 when auth service rejects registration', async () => {
    authServiceMocks.register.mockRejectedValue(new Error('User already registered'));

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: 'password1' });

    expect(res.status).toBe(400);
    expect(authServiceMocks.register).toHaveBeenCalledWith('user@example.com', 'password1');
  });

  it('registers user and returns profile', async () => {
    authServiceMocks.register.mockResolvedValue({
      id: 'u-new',
      email: 'user@example.com',
      role: 'user',
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: 'password1' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'u-new', email: 'user@example.com', role: 'user' });
    expect(authServiceMocks.register).toHaveBeenCalledWith('user@example.com', 'password1');
  });
});
