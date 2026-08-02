import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  createParagraphsDomainOverlay,
  createProjectsDomainOverlay,
  createReaderProgressDomainOverlay,
  getSupabaseMock,
  resetMocks,
} from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleChapter, sampleProject } from '../helpers/fixtures.js';

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/paragraphs.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createParagraphsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/readerProgress.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createReaderProgressDomainOverlay() };
});

const STATUS_PATH = '/api/projects/proj-1/chapters/ch-1/status';
const PARAGRAPH_PATH = '/api/projects/proj-1/chapters/ch-1/paragraphs/p-1';

describe('chapter mutations (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  describe('PUT /api/projects/:projectId/chapters/:chapterId/status', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).put(STATUS_PATH).send({ status: 'completed' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when status is invalid', async () => {
      getSupabaseMock('getProject').mockResolvedValue(sampleProject());

      const res = await request(app)
        .put(STATUS_PATH)
        .set('Authorization', 'Bearer tok')
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'Validation failed' });
      expect(getSupabaseMock('updateChapterStatus')).not.toHaveBeenCalled();
    });

    it('updates chapter status for author', async () => {
      const chapter = sampleChapter({ status: 'completed' });
      getSupabaseMock('getProject').mockResolvedValue(sampleProject());
      getSupabaseMock('updateChapterStatus').mockResolvedValue(chapter);

      const res = await request(app)
        .put(STATUS_PATH)
        .set('Authorization', 'Bearer tok')
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 'ch-1', status: 'completed' });
      expect(getSupabaseMock('updateChapterStatus')).toHaveBeenCalledWith(
        'proj-1',
        'ch-1',
        'completed',
        'tok'
      );
    });
  });

  describe('PUT /api/projects/:projectId/chapters/:chapterId/paragraphs/:paragraphId', () => {
    it('returns 400 when status is invalid', async () => {
      const res = await request(app)
        .put(PARAGRAPH_PATH)
        .set('Authorization', 'Bearer tok')
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'Validation failed' });
      expect(getSupabaseMock('updateParagraph')).not.toHaveBeenCalled();
    });

    it('updates paragraph translated text', async () => {
      const paragraph = {
        id: 'p-1',
        chapterId: 'ch-1',
        translatedText: 'Привет',
        status: 'translated',
      };
      getSupabaseMock('updateParagraph').mockResolvedValue(paragraph);

      const res = await request(app)
        .put(PARAGRAPH_PATH)
        .set('Authorization', 'Bearer tok')
        .send({ translatedText: 'Привет' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 'p-1', translatedText: 'Привет' });
      expect(getSupabaseMock('updateParagraph')).toHaveBeenCalledWith(
        'proj-1',
        'ch-1',
        'p-1',
        expect.objectContaining({ translatedText: 'Привет', editedBy: 'user' }),
        'tok'
      );
    });
  });
});
