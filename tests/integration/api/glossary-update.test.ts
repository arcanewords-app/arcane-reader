import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  createGlossaryDomainOverlay,
  createProjectsDomainOverlay,
  getSupabaseMock,
  resetMocks,
} from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleProject } from '../helpers/fixtures.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/glossary.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createGlossaryDomainOverlay() };
});
vi.mock('../../../src/services/engine-integration.js', () => ({
  clearAgentCache: vi.fn(),
  getNameDeclensions: vi.fn(() => ({
    translatedName: 'Алиса',
    declensions: {
      nominative: 'Алиса',
      genitive: 'Алисы',
      dative: 'Алисе',
      accusative: 'Алису',
      instrumental: 'Алисой',
      prepositional: 'Алисе',
    },
  })),
}));
vi.mock('../../../src/services/cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches: vi.fn().mockResolvedValue(undefined),
}));

const UPDATE_PATH = '/api/projects/proj-1/glossary/ge-1';

describe('PUT /api/projects/:projectId/glossary/:entryId (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).put(UPDATE_PATH).send({ translated: 'Алиса' });

    expect(res.status).toBe(401);
  });

  it('returns 404 when project is missing', async () => {
    getSupabaseMock('getProject').mockResolvedValue(null);

    const res = await request(app)
      .put(UPDATE_PATH)
      .set('Authorization', 'Bearer tok')
      .send({ translated: 'Алиса', type: 'character', original: 'Alice' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Project not found' });
    expect(getSupabaseMock('updateGlossaryEntry')).not.toHaveBeenCalled();
  });

  it('updates glossary entry for author', async () => {
    const project = sampleProject();
    const entry = {
      id: 'ge-1',
      original: 'Alice',
      translated: 'Алиса',
      type: 'character',
    };
    getSupabaseMock('getProject').mockResolvedValue(project);
    getSupabaseMock('updateGlossaryEntry').mockResolvedValue(entry);

    const res = await request(app)
      .put(UPDATE_PATH)
      .set('Authorization', 'Bearer tok')
      .set('X-Test-Role', 'author')
      .send({
        original: 'Alice',
        translated: 'Алиса',
        type: 'character',
        gender: 'female',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'ge-1', translated: 'Алиса' });
    expect(getSupabaseMock('updateGlossaryEntry')).toHaveBeenCalledWith(
      'proj-1',
      'ge-1',
      expect.objectContaining({ original: 'Alice', translated: 'Алиса', type: 'character' }),
      'tok'
    );
  });
});
