import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { getSupabaseMock, resetMocks } from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleNewsPost } from '../helpers/fixtures.js';

vi.mock('../../../src/services/newsDraftTranslation.js', () => ({
  draftNewsTranslation: vi.fn(async () => ({
    title: 'Draft title',
    summary: 'Draft summary',
    body: 'Draft body',
  })),
}));
vi.mock('../../../src/middleware/auth.js', () => installAuthMocks());
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/news.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { createNewsDomainOverlay } = await import('../helpers/mockSupabase.js');
  return { ...actual, ...createNewsDomainOverlay() };
});

describe('GET /api/news (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('returns 200 with published posts', async () => {
    const post = sampleNewsPost();
    getSupabaseMock('listPublishedNewsPosts').mockResolvedValue([post]);

    const res = await request(app).get('/api/news');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: post.id,
        slug: post.slug,
        title: post.title,
        summary: post.summary,
        body: post.body,
        category: post.category,
        status: post.status,
        publishedAt: post.publishedAt,
        fellBack: false,
        resolvedLocale: 'ru',
      },
    ]);
  });

  it('returns a ready locale and hides draft translations', async () => {
    getSupabaseMock('listPublishedNewsPosts').mockResolvedValue([
      sampleNewsPost({
        primaryLocale: 'ru',
        translations: {
          en: { title: 'Hello', summary: 'Sum', body: 'Body EN', status: 'ready' },
          be: { title: 'Draft', summary: '', body: '', status: 'draft' },
        },
      }),
    ]);

    const res = await request(app).get('/api/news').query({ locale: 'en' });

    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe('Hello');
    expect(res.body[0].fellBack).toBe(false);
    expect(res.body[0].translations).toBeUndefined();
  });

  it('falls back to Russian when the requested locale is not ready', async () => {
    getSupabaseMock('listPublishedNewsPosts').mockResolvedValue([
      sampleNewsPost({
        title: 'Русский',
        translations: { be: { title: 'x', summary: '', body: '', status: 'draft' } },
      }),
    ]);

    const res = await request(app).get('/api/news').query({ locale: 'be' });

    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe('Русский');
    expect(res.body[0].fellBack).toBe(true);
    expect(res.body[0].resolvedLocale).toBe('ru');
  });

  it('returns 404 when post is missing (unpublished/draft not exposed)', async () => {
    getSupabaseMock('getPublishedNewsPostByIdOrSlug').mockResolvedValue(null);

    const res = await request(app).get('/api/news/draft-slug');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'News post not found' });
  });

  it('returns 200 when post is found by slug', async () => {
    const post = sampleNewsPost({ slug: 'hello-wave' });
    getSupabaseMock('getPublishedNewsPostByIdOrSlug').mockResolvedValue(post);

    const res = await request(app).get('/api/news/hello-wave');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      slug: 'hello-wave',
      title: 'Hello Wave',
      fellBack: false,
      resolvedLocale: 'ru',
    });
    expect(res.body.translations).toBeUndefined();
  });

  it('saves an English translation without rewriting the Russian title', async () => {
    getSupabaseMock('getNewsPostByIdAdmin').mockResolvedValue({
      id: 'news-1',
      slug: 'hello-wave',
      title: 'Hello Wave',
      translations: {},
    });
    getSupabaseMock('updateNewsPost').mockResolvedValue({ id: 'news-1', title: 'Hello Wave' });

    const res = await request(app)
      .patch('/api/admin/news/news-1')
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Role', 'admin')
      .send({
        translation: {
          locale: 'en',
          title: 'Hello',
          summary: 'Sum',
          body: 'Body',
          status: 'ready',
        },
      });

    expect(res.status).toBe(200);
    const payload = getSupabaseMock('updateNewsPost').mock.calls[0]?.[1] as {
      title?: string;
      translations: { en: { status: string; title: string } };
    };
    expect(payload.title).toBeUndefined();
    expect(payload.translations.en.title).toBe('Hello');
    expect(payload.translations.en.status).toBe('ready');
  });

  it('does not bump announcement content version when saving a translation', async () => {
    getSupabaseMock('updateAnnouncementAlert').mockResolvedValue({ id: 'alert-1', contentVersion: 3 });

    const res = await request(app)
      .patch('/api/admin/announcements/alert-1')
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Role', 'admin')
      .send({ translation: { locale: 'en', message: 'Hi', ctaLabel: 'Go' } });

    expect(res.status).toBe(200);
    const payload = getSupabaseMock('updateAnnouncementAlert').mock.calls[0]?.[1] as {
      contentVersion?: number;
      translation?: { message: string };
    };
    expect(payload.contentVersion).toBeUndefined();
    expect(payload.translation?.message).toBe('Hi');
  });

  it('stores an AI translation as a draft', async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
    getSupabaseMock('getNewsPostByIdAdmin').mockResolvedValue({
      id: 'news-1',
      slug: null,
      title: 'Заголовок',
      summary: 'Описание',
      body: 'Текст',
      translations: {},
    });
    getSupabaseMock('updateNewsPost').mockResolvedValue({ id: 'news-1' });

    const res = await request(app)
      .post('/api/admin/news/news-1/translate')
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Role', 'admin')
      .send({ locale: 'en' });

    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;

    expect(res.status).toBe(200);
    const payload = getSupabaseMock('updateNewsPost').mock.calls[0]?.[1] as {
      status?: string;
      translations: { en: { status: string; title: string } };
    };
    expect(payload.status).toBeUndefined();
    expect(payload.translations.en.status).toBe('draft');
    expect(payload.translations.en.title).toBe('Draft title');
  });

  it('returns 400 for invalid limit query', async () => {
    const res = await request(app).get('/api/news').query({ limit: 999 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation failed' });
    expect(res.body).toHaveProperty('details');
  });
});
