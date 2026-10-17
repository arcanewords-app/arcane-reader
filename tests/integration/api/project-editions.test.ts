import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  createChaptersDomainOverlay,
  createProjectsDomainOverlay,
  getSupabaseMock,
  resetMocks,
} from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleChapter, sampleProject } from '../helpers/fixtures.js';

const createProjectEdition = vi.fn();
const listProjectEditionLanguages = vi.fn();

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/chapters.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createChaptersDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/editions.js', () => ({
  createProjectEdition: (...args: unknown[]) => createProjectEdition(...args),
  listProjectEditionLanguages: (...args: unknown[]) => listProjectEditionLanguages(...args),
  chapterHasTranslatingLock: vi.fn(async () => false),
  listChapterEditionStates: vi.fn(async () => new Map()),
}));

describe('project editions (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
    createProjectEdition.mockReset();
    listProjectEditionLanguages.mockReset();
    listProjectEditionLanguages.mockResolvedValue(['be']);
  });

  it('POST /editions creates a language row', async () => {
    createProjectEdition.mockResolvedValue({ targetLanguage: 'be' });
    const res = await request(app)
      .post('/api/projects/proj-1/editions')
      .set('Authorization', 'Bearer tok')
      .set('X-Test-Role', 'author')
      .send({ targetLanguage: 'be' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ targetLanguage: 'be' });
    expect(createProjectEdition).toHaveBeenCalledWith('proj-1', 'be', 'tok');
  });

  it('GET chapter with lang asks for the edition, not the primary translated text', async () => {
    getSupabaseMock('getProject').mockResolvedValue(sampleProject());
    getSupabaseMock('verifyChapterAccess').mockResolvedValue(true);
    getSupabaseMock('getChapter').mockResolvedValue(
      sampleChapter({ translatedText: 'primary only' })
    );

    const res = await request(app)
      .get('/api/projects/proj-1/chapters/ch-1?lang=be')
      .set('Authorization', 'Bearer tok')
      .set('X-Test-Role', 'author');

    expect(res.status).toBe(200);
    expect(getSupabaseMock('getChapter')).toHaveBeenCalledWith(
      'proj-1',
      'ch-1',
      'tok',
      expect.objectContaining({ editionLanguage: 'be' })
    );
  });
});
