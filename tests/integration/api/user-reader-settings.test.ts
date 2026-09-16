import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { bootTestApp } from '../helpers/createTestApp.js';

const getUserReaderSettings = vi.fn();
const updateUserReaderSettings = vi.fn();

vi.mock('../../../src/middleware/auth.js', () =>
  installAuthMocks({ defaultRole: 'user', defaultEmail: 'user@example.com' })
);
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabaseDatabase.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getUserReaderSettings,
    updateUserReaderSettings,
  };
});

const READER_SETTINGS_PATH = '/api/user/reader-settings';

const sampleSettings = {
  fontFamily: 'eb_garamond',
  fontSize: 20,
  lineHeight: 1.6,
  colorScheme: 'paper',
  textIndent: true,
  textAlign: 'justify',
  hideChapterHeader: false,
  paragraphSpacing: 0.5,
  containerWidth: 89,
};

describe('user reader settings API (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    getUserReaderSettings.mockReset();
    updateUserReaderSettings.mockReset();
  });

  describe('GET /api/user/reader-settings', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get(READER_SETTINGS_PATH);

      expect(res.status).toBe(401);
      expect(getUserReaderSettings).not.toHaveBeenCalled();
    });

    it('returns saved settings including containerWidth', async () => {
      getUserReaderSettings.mockResolvedValue(sampleSettings);

      const res = await request(app)
        .get(READER_SETTINGS_PATH)
        .set('Authorization', 'Bearer tok');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ containerWidth: 89, colorScheme: 'paper' });
      expect(getUserReaderSettings).toHaveBeenCalledWith('test-user-id', 'tok');
    });

    it('returns null when the user has no saved settings', async () => {
      getUserReaderSettings.mockResolvedValue(null);

      const res = await request(app)
        .get(READER_SETTINGS_PATH)
        .set('Authorization', 'Bearer tok');

      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe('PUT /api/user/reader-settings', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).put(READER_SETTINGS_PATH).send({ containerWidth: 89 });

      expect(res.status).toBe(401);
      expect(updateUserReaderSettings).not.toHaveBeenCalled();
    });

    it('forwards containerWidth in the request body', async () => {
      updateUserReaderSettings.mockResolvedValue({ ...sampleSettings, containerWidth: 50 });

      const res = await request(app)
        .put(READER_SETTINGS_PATH)
        .set('Authorization', 'Bearer tok')
        .send({ containerWidth: 50 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ containerWidth: 50 });
      expect(updateUserReaderSettings).toHaveBeenCalledWith(
        'test-user-id',
        { containerWidth: 50 },
        'tok'
      );
    });
  });
});
