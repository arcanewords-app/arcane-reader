/**
 * Mock-integration smoke: createApp() + supertest against /api/status.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { bootTestApp } from '../helpers/createTestApp.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks());
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());

describe('GET /api/status (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  it('returns version, storage, and config shape', async () => {
    const res = await request(app).get('/api/status');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      version: '0.1.0',
      storage: 'supabase',
    });
    expect(res.body).toHaveProperty('ready');
    expect(res.body).toHaveProperty('ai');
    expect(res.body).toHaveProperty('config');
    expect(res.body.config).toHaveProperty('valid');
  });
});

describe('POST /api/auth/login (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  it('returns 400 when body fails Zod validation', async () => {
    const res = await request(app).post('/api/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(res.body).toHaveProperty('details');
  });
});
