/**
 * Mock-integration smoke: createApp() + supertest against /api/status.
 * No live Supabase/Redis required — status handler reads config only.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/createApp.js';

describe('GET /api/status (integration)', () => {
  it('returns version, storage, and config shape', async () => {
    const { app } = createApp();
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
  it('returns 400 when body fails Zod validation', async () => {
    const { app } = createApp();
    const res = await request(app).post('/api/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(res.body).toHaveProperty('details');
  });
});
