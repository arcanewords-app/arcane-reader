import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPublicationsPublic: vi.fn(),
  getPublicationWithChapters: vi.fn(),
  listPublishedNewsPosts: vi.fn(),
  getPublishedNewsPostByIdOrSlug: vi.fn(),
  readFileSync: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('../../services/supabaseDatabase.js', () => ({
  listPublicationsPublic: mocks.listPublicationsPublic,
  getPublicationWithChapters: mocks.getPublicationWithChapters,
  listPublishedNewsPosts: mocks.listPublishedNewsPosts,
  getPublishedNewsPostByIdOrSlug: mocks.getPublishedNewsPostByIdOrSlug,
}));

vi.mock('fs', () => ({
  default: { readFileSync: mocks.readFileSync },
  readFileSync: mocks.readFileSync,
}));

vi.mock('../../logger.js', () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../shared/seoHtml.js', async () => {
  const actual =
    await vi.importActual<typeof import('../../shared/seoHtml.js')>('../../shared/seoHtml.js');
  return {
    ...actual,
    resolveIndexPath: () => '/tmp/index.html',
  };
});

import type { Application, Request, Response } from 'express';
import { registerSeoRoutes } from './seo.js';

type RouteHandler = (req: Request, res: Response, next?: (err?: unknown) => void) => unknown;

function createMockApp() {
  const routes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, ...handlers: RouteHandler[]) {
      routes.set(`GET ${path}`, handlers[handlers.length - 1]!);
      return app;
    },
  } as unknown as Application;
  return { app, routes };
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    protocol: 'https',
    get(name: string) {
      if (name === 'host') return 'arcane.example';
      return undefined;
    },
    params: {},
    ...overrides,
  } as Request;
}

function mockRes() {
  const res = {
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sendFile: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & typeof res;
}

const SAMPLE_HTML = `<!doctype html><html><head>
<title>Default</title>
<meta name="description" content="d" />
<meta property="og:title" content="t" />
<meta property="og:description" content="d" />
<meta property="og:type" content="website" />
<meta property="og:image" content="https://old/img.png" />
<meta name="twitter:title" content="t" />
<meta name="twitter:description" content="d" />
<meta name="twitter:image" content="https://old/img.png" />
</head><body><div id="app"></div></body></html>`;

describe('registerSeoRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readFileSync.mockReturnValue(SAMPLE_HTML);
    mocks.listPublicationsPublic.mockResolvedValue([]);
    mocks.listPublishedNewsPosts.mockResolvedValue([]);
    mocks.getPublicationWithChapters.mockResolvedValue(null);
    mocks.getPublishedNewsPostByIdOrSlug.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers robots, sitemap, publication, news, static, and SPA routes', () => {
    const { app, routes } = createMockApp();
    const after = vi.fn();
    registerSeoRoutes(app, { clientPath: '/client', publicPath: '/public' }, after);

    assert.ok(routes.has('GET /robots.txt'));
    assert.ok(routes.has('GET /api/robots'));
    assert.ok(routes.has('GET /sitemap.xml'));
    assert.ok(routes.has('GET /api/sitemap'));
    assert.ok(routes.has('GET /p/:publicationId'));
    assert.ok(routes.has('GET /p/:publicationId/chapters/:chapterId/reading'));
    assert.ok(routes.has('GET /news/:slugOrId'));
    assert.ok(routes.has('GET /'));
    assert.ok(routes.has('GET /catalog'));
    assert.ok(routes.has('GET /{*splat}'));
    assert.equal(after.mock.calls.length, 1);
  });

  it('serves robots.txt with public base url', () => {
    const { app, routes } = createMockApp();
    registerSeoRoutes(app, { clientPath: '/c', publicPath: '/p' });
    const res = mockRes();
    routes.get('GET /robots.txt')!(mockReq(), res);
    assert.equal(res.type.mock.calls[0]![0], 'text/plain');
    assert.match(
      String(res.send.mock.calls[0]![0]),
      /Sitemap: https:\/\/arcane\.example\/sitemap\.xml/
    );
  });

  it('builds sitemap with publications, chapter reading urls, and news', async () => {
    mocks.listPublicationsPublic.mockResolvedValue([
      { id: 'pub-1', slug: 'my-novel', updatedAt: '2026-01-15T00:00:00Z' },
      { id: 'pub-2', slug: null, updatedAt: null },
    ]);
    mocks.getPublicationWithChapters.mockImplementation(async (id: string) => {
      if (id === 'my-novel') {
        return {
          publication: { id: 'pub-1', slug: 'my-novel' },
          chapters: [
            { id: 'ch-raw', hasTranslation: false },
            { id: 'ch-1', hasTranslation: true },
          ],
        };
      }
      return { publication: { id: 'pub-2' }, chapters: [] };
    });
    mocks.listPublishedNewsPosts.mockResolvedValue([
      { id: 'n1', slug: 'hello', updatedAt: '2026-02-01T00:00:00Z' },
    ]);

    const { app, routes } = createMockApp();
    registerSeoRoutes(app, { clientPath: '/c', publicPath: '/p' });
    const res = mockRes();
    await routes.get('GET /api/sitemap')!(mockReq(), res, () => {});

    const xml = String(res.send.mock.calls[0]![0]);
    assert.match(xml, /<loc>https:\/\/arcane\.example\/p\/my-novel<\/loc>/);
    assert.match(
      xml,
      /<loc>https:\/\/arcane\.example\/p\/my-novel\/chapters\/ch-1\/reading<\/loc>/
    );
    assert.match(xml, /<loc>https:\/\/arcane\.example\/news\/hello<\/loc>/);
    assert.match(xml, /<loc>https:\/\/arcane\.example\/about<\/loc>/);
  });

  it('continues sitemap when publication/news loaders fail', async () => {
    mocks.listPublicationsPublic.mockRejectedValue(new Error('db down'));
    mocks.listPublishedNewsPosts.mockRejectedValue(new Error('news down'));
    const { app, routes } = createMockApp();
    registerSeoRoutes(app, { clientPath: '/c', publicPath: '/p' });
    const res = mockRes();
    await routes.get('GET /sitemap.xml')!(mockReq(), res, () => {});
    const xml = String(res.send.mock.calls[0]![0]);
    assert.match(xml, /<loc>https:\/\/arcane\.example\/<\/loc>/);
    assert.equal(mocks.loggerWarn.mock.calls.length >= 2, true);
  });

  it('serves static page html with organization json-ld on home', () => {
    const { app, routes } = createMockApp();
    registerSeoRoutes(app, { clientPath: '/c', publicPath: '/p' });
    const res = mockRes();
    routes.get('GET /')!(mockReq(), res);
    const html = String(res.send.mock.calls[0]![0]);
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /Organization/);
  });

  it('falls back to sendFile when publication is missing', async () => {
    mocks.getPublicationWithChapters.mockResolvedValue(null);
    const { app, routes } = createMockApp();
    registerSeoRoutes(app, { clientPath: '/c', publicPath: '/p' });
    const res = mockRes();
    await routes.get('GET /p/:publicationId')!(
      mockReq({ params: { publicationId: 'missing' } }),
      res,
      () => {}
    );
    assert.equal(res.sendFile.mock.calls.length, 1);
  });

  it('injects publication chapter meta when chapter exists', async () => {
    mocks.getPublicationWithChapters.mockResolvedValue({
      publication: {
        id: 'pub-1',
        slug: 'my-novel',
        title: 'My Novel',
        description: 'A story',
        authorDisplay: 'Author',
        translatorDisplay: 'Translator',
        coverImageUrl: 'https://cdn.example/cover.jpg',
        targetLanguage: 'ru',
        epubStoragePath: 'a.epub',
        fb2StoragePath: null,
      },
      chapters: [{ id: 'ch-1', number: 1, title: 'Beginnings', hasTranslation: true }],
    });
    const { app, routes } = createMockApp();
    registerSeoRoutes(app, { clientPath: '/c', publicPath: '/p' });
    const res = mockRes();
    await routes.get('GET /p/:publicationId/chapters/:chapterId/reading')!(
      mockReq({ params: { publicationId: 'my-novel', chapterId: 'ch-1' } }),
      res,
      () => {}
    );
    const html = String(res.send.mock.calls[0]![0]);
    assert.match(html, /Beginnings/);
    assert.match(html, /BreadcrumbList/);
    assert.match(html, /application\/ld\+json/);
  });

  it('serves news detail html and falls back when missing', async () => {
    const { app, routes } = createMockApp();
    registerSeoRoutes(app, { clientPath: '/c', publicPath: '/p' });

    const missingRes = mockRes();
    await routes.get('GET /news/:slugOrId')!(
      mockReq({ params: { slugOrId: 'gone' } }),
      missingRes,
      () => {}
    );
    assert.equal(missingRes.sendFile.mock.calls.length, 1);

    mocks.getPublishedNewsPostByIdOrSlug.mockResolvedValue({
      id: 'n1',
      slug: 'hello',
      title: 'Hello News',
      summary: '  ',
      publishedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
    const okRes = mockRes();
    await routes.get('GET /news/:slugOrId')!(
      mockReq({ params: { slugOrId: 'hello' } }),
      okRes,
      () => {}
    );
    const html = String(okRes.send.mock.calls[0]![0]);
    assert.match(html, /Hello News/);
    assert.match(html, /NewsArticle/);
  });

  it('SPA fallback sends index.html', () => {
    const { app, routes } = createMockApp();
    registerSeoRoutes(app, { clientPath: '/c', publicPath: '/p' });
    const res = mockRes();
    routes.get('GET /{*splat}')!(mockReq(), res);
    assert.equal(res.sendFile.mock.calls[0]![0], '/tmp/index.html');
  });
});
