/**
 * HTTP regression: POST /translate must not treat IncomingMessage 'close'
 * after a fully-read JSON body as a user cancel. Do not mock performTranslation —
 * that is the hole in translation.test.ts.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  createChaptersDomainOverlay,
  createProjectsDomainOverlay,
  createSupabaseDatabaseOverlay,
  getSupabaseMock,
  resetMocks,
} from '../helpers/mockSupabase.js';
import { installTokenLimitMocks, resetTokenLimitMocks } from '../helpers/mockTokenLimits.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleChapter, sampleProject } from '../helpers/fixtures.js';

const { mockTranslateChapterWithPipeline } = vi.hoisted(() => ({
  mockTranslateChapterWithPipeline: vi.fn(),
}));

if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'sk-test-integration-abort-regression';
}

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/middleware/tokenLimits.js', () => installTokenLimitMocks());
vi.mock('../../../src/services/cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches: vi.fn().mockResolvedValue(undefined),
  invalidateUserProjectCaches: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/services/engine-integration.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    translateChapterWithPipeline: (...args: unknown[]) => mockTranslateChapterWithPipeline(...args),
  };
});
vi.mock('../../../src/services/supabaseDatabase.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createSupabaseDatabaseOverlay() };
});
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/chapters.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createChaptersDomainOverlay() };
});

const TRANSLATE_PATH = '/api/projects/proj-1/chapters/ch-1/translate';

function chapterWithParagraphs() {
  return sampleChapter({
    paragraphs: [
      {
        id: 'para-1',
        index: 0,
        originalText: 'Hello world. This is sample chapter text for translation wiring.',
        translatedText: '',
        status: 'pending',
      },
    ],
  });
}

function stubHappyTranslate() {
  const chapter = chapterWithParagraphs();
  getSupabaseMock('getProject').mockResolvedValue(sampleProject());
  getSupabaseMock('getChapter').mockResolvedValue(chapter);
  getSupabaseMock('updateChapter').mockResolvedValue(true);
}

describe('POST /translate abort after fully-read body (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
    resetTokenLimitMocks();
    mockTranslateChapterWithPipeline.mockReset();
    mockTranslateChapterWithPipeline.mockImplementation(
      async (_config, _project, _chapter, options) => {
        const cancelledAtStart =
          typeof options === 'object' &&
          options !== null &&
          'isCancelled' in options &&
          typeof (options as { isCancelled?: () => boolean }).isCancelled === 'function'
            ? (options as { isCancelled: () => boolean }).isCancelled()
            : false;
        if (cancelledAtStart) {
          throw new Error('pipeline invoked while isCancelled() was true');
        }
        return {
          translatedText: 'Привет мир.',
          tokensUsed: 12,
          tokensByStage: { translation: 12 },
          duration: 25,
          glossaryUpdates: [],
          glossaryUpdatesExisting: [],
          glossaryAppearanceEntryIds: [],
        };
      }
    );
    stubHappyTranslate();
  });

  it('starts the pipeline after POST body close (does not false-cancel)', async () => {
    const res = await request(app)
      .post(TRANSLATE_PATH)
      .set('Authorization', 'Bearer tok')
      .send({ stages: ['translation'], translateChapterTitles: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'started', chapterId: 'ch-1' });

    await vi.waitFor(() => {
      expect(mockTranslateChapterWithPipeline).toHaveBeenCalled();
    });

    const statuses = getSupabaseMock('updateChapter').mock.calls.map(
      (call) => (call[2] as { status?: string } | undefined)?.status
    );
    expect(statuses).toContain('translating');
    expect(statuses).not.toContain('pending');
  });
});
