import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { createProjectsDomainOverlay, getSupabaseMock, resetMocks } from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleProject } from '../helpers/fixtures.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/engine-integration.js', () => ({
  clearAgentCache: vi.fn(),
}));
vi.mock('../../../src/services/analysisCache.js', () => ({
  invalidateAnalysisForProject: vi.fn().mockResolvedValue(undefined),
}));

const PROJECT_ID = 'proj-1';

describe('project mutations (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  describe('PATCH /api/projects/:id', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).patch(`/api/projects/${PROJECT_ID}`).send({ name: 'Renamed' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when name is empty', async () => {
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}`)
        .set('Authorization', 'Bearer tok')
        .send({ name: '   ' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'Validation failed' });
      expect(getSupabaseMock('updateProject')).not.toHaveBeenCalled();
    });

    it('renames project for author', async () => {
      const updated = sampleProject({ title: 'Renamed Project' });
      getSupabaseMock('updateProject').mockResolvedValue(updated);

      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}`)
        .set('Authorization', 'Bearer tok')
        .send({ name: 'Renamed Project' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ title: 'Renamed Project' });
      expect(getSupabaseMock('updateProject')).toHaveBeenCalledWith(
        PROJECT_ID,
        { name: 'Renamed Project' },
        'test-user-id',
        'tok'
      );
    });
  });

  describe('PUT /api/projects/:id/languages', () => {
    it('returns 404 when project is missing', async () => {
      getSupabaseMock('getProject').mockResolvedValue(null);

      const res = await request(app)
        .put(`/api/projects/${PROJECT_ID}/languages`)
        .set('Authorization', 'Bearer tok')
        .send({ sourceLanguage: 'en', targetLanguage: 'ru' });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: 'Project not found' });
    });

    it('updates language pair when unlocked', async () => {
      const project = sampleProject();
      const updated = sampleProject({ sourceLanguage: 'ko', targetLanguage: 'ru' });
      getSupabaseMock('getProject').mockResolvedValue(project);
      getSupabaseMock('updateProject').mockResolvedValue(updated);

      const res = await request(app)
        .put(`/api/projects/${PROJECT_ID}/languages`)
        .set('Authorization', 'Bearer tok')
        .send({ sourceLanguage: 'ko', targetLanguage: 'ru' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ sourceLanguage: 'ko', targetLanguage: 'ru' });
      expect(getSupabaseMock('updateProject')).toHaveBeenCalledWith(
        PROJECT_ID,
        { sourceLanguage: 'ko', targetLanguage: 'ru' },
        'test-user-id',
        'tok'
      );
    });
  });

  describe('PUT /api/projects/:id/settings', () => {
    it('returns 400 when temperature is out of range', async () => {
      getSupabaseMock('getProject').mockResolvedValue(sampleProject());

      const res = await request(app)
        .put(`/api/projects/${PROJECT_ID}/settings`)
        .set('Authorization', 'Bearer tok')
        .send({ temperature: 3 });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'Validation failed' });
      expect(getSupabaseMock('updateProject')).not.toHaveBeenCalled();
    });

    it('updates project settings', async () => {
      const project = sampleProject({ settings: { temperature: 0.7 } });
      const updated = sampleProject({ settings: { temperature: 1.0 } });
      getSupabaseMock('getProject').mockResolvedValue(project);
      getSupabaseMock('updateProject').mockResolvedValue(updated);

      const res = await request(app)
        .put(`/api/projects/${PROJECT_ID}/settings`)
        .set('Authorization', 'Bearer tok')
        .send({ temperature: 1.0 });

      expect(res.status).toBe(200);
      expect(getSupabaseMock('updateProject')).toHaveBeenCalledWith(
        PROJECT_ID,
        expect.objectContaining({ settings: expect.objectContaining({ temperature: 1.0 }) }),
        'test-user-id',
        'tok'
      );
    });
  });
});
