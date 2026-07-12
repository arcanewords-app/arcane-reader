import type { Application, Request, Response } from 'express';
import fs from 'fs';
import {
  listPublicationsPublic,
  getPublicationWithChapters,
  listPublishedNewsPosts,
  getPublishedNewsPostByIdOrSlug,
} from '../../services/supabaseDatabase.js';
import { logger } from '../../logger.js';
import { buildRobotsTxt } from '../../shared/robotsTxt.js';
import { STATIC_PAGE_META } from '../../shared/staticPageMeta.js';
import { escapeHtml, resolveIndexPath } from '../../shared/seoHtml.js';
import { requireRouteParam } from '../validateRoute.js';
import {
  getPublicBaseUrl,
  injectBreadcrumbJsonLd,
  injectNewsArticleJsonLd,
  injectNewsContent,
  injectOrganizationJsonLd,
  injectPublicationContent,
  injectPublicationJsonLd,
  injectPublicationMeta,
  injectStaticPageMeta,
} from './handlers/seoHelpers.js';

export type SeoRouteDeps = {
  clientPath: string;
  publicPath: string;
};

const SITEMAP_CHAPTER_PUBS_LIMIT = 100;
const SITEMAP_NEWS_LIMIT = 100;

const STATIC_SEO_PATHS = [
  '/',
  '/catalog',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/news',
  '/account-tiers',
];

/**
 * Serve index.html with page-specific meta for static routes.
 */
function serveStaticPageHtml(
  req: Request,
  res: Response,
  pathname: string,
  clientPath: string,
  publicPath: string
): void {
  const base = getPublicBaseUrl(req);
  const pageUrl = base + pathname;
  const meta = STATIC_PAGE_META[pathname];
  if (!meta) {
    res.sendFile(resolveIndexPath(clientPath, publicPath));
    return;
  }
  const canonicalUrl = pathname === '/catalog' ? base + '/' : pageUrl;
  const indexPath = resolveIndexPath(clientPath, publicPath);
  let html = fs.readFileSync(indexPath, 'utf-8');
  html = html.replace(/__PUBLIC_URL__/g, base);
  html = injectStaticPageMeta(html, {
    title: meta.title,
    description: meta.description,
    pageUrl,
    canonicalUrl,
  });
  if (pathname === '/' || pathname === '/catalog') {
    html = injectOrganizationJsonLd(html, base + '/');
  }
  res.type('html').send(html);
}

function sendRobotsTxt(req: Request, res: Response): void {
  const base = getPublicBaseUrl(req);
  res.type('text/plain').send(buildRobotsTxt(base));
}

async function sendSitemapXml(req: Request, res: Response): Promise<void> {
  const base = getPublicBaseUrl(req);
  let pubUrls = '';
  let chapterUrls = '';
  try {
    const pubs = await listPublicationsPublic({ limit: 1000 });
    for (const p of pubs) {
      const pubPath = (p as { slug?: string | null }).slug || p.id;
      const lastmod = p.updatedAt
        ? `<lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod>
    `
        : '';
      pubUrls += `  <url>
    <loc>${escapeHtml(base + '/p/' + pubPath)}</loc>
    ${lastmod}<changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    }
    for (let i = 0; i < Math.min(pubs.length, SITEMAP_CHAPTER_PUBS_LIMIT); i++) {
      const p = pubs[i];
      const pubPath = (p as { slug?: string | null }).slug || p.id;
      try {
        const data = await getPublicationWithChapters(pubPath);
        if (!data?.chapters?.length) continue;
        const firstTranslated = data.chapters.find((c) => c.hasTranslation);
        if (!firstTranslated) continue;
        const lastmod = p.updatedAt
          ? `<lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod>
    `
          : '';
        chapterUrls += `  <url>
    <loc>${escapeHtml(base + '/p/' + pubPath + '/chapters/' + firstTranslated.id + '/reading')}</loc>
    ${lastmod}<changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
      } catch {
        /* skip on error */
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load publications for sitemap');
  }
  let newsUrls = '';
  try {
    const posts = await listPublishedNewsPosts({ limit: SITEMAP_NEWS_LIMIT });
    for (const post of posts) {
      const slug = post.slug || post.id;
      const lastmod = post.updatedAt
        ? `<lastmod>${new Date(post.updatedAt).toISOString().slice(0, 10)}</lastmod>
    `
        : '';
      newsUrls += `  <url>
    <loc>${escapeHtml(base + '/news/' + slug)}</loc>
    ${lastmod}<changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`;
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load news for sitemap');
  }
  const staticPages = [
    '/about',
    '/contact',
    '/privacy',
    '/terms',
    '/catalog',
    '/news',
    '/account-tiers',
  ]
    .map(
      (p) => `  <url>
    <loc>${escapeHtml(base + p)}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
`
    )
    .join('');

  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeHtml(base + '/')}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${staticPages}${pubUrls}${chapterUrls}${newsUrls}</urlset>
`
  );
}

async function servePublicationHtml(
  req: Request,
  res: Response,
  publicationId: string,
  clientPath: string,
  publicPath: string,
  chapterId?: string
): Promise<void> {
  const base = getPublicBaseUrl(req);
  const indexPath = resolveIndexPath(clientPath, publicPath);

  const data = await getPublicationWithChapters(publicationId);
  if (!data) {
    res.sendFile(indexPath);
    return;
  }

  const pub = data.publication;
  const pubPath = (pub as { slug?: string | null }).slug || publicationId;
  const title = pub.title || 'Publication';
  const baseDesc =
    pub.description || (pub.authorDisplay ? `${title} by ${pub.authorDisplay}` : title);
  const pageUrl = chapterId
    ? `${base}/p/${pubPath}/chapters/${chapterId}/reading`
    : `${base}/p/${pubPath}`;

  let pageTitle = title;
  let pageDesc = baseDesc;
  if (chapterId) {
    const ch = data.chapters.find((c) => c.id === chapterId);
    if (ch) {
      pageTitle = `${ch.title || `Chapter ${ch.number}`} — ${title}`;
      pageDesc = `${ch.title || `Chapter ${ch.number}`} of ${title}`;
    }
  } else {
    const hasBuiltExports = !!(pub.epubStoragePath || pub.fb2StoragePath);
    pageDesc = hasBuiltExports
      ? `${pageDesc} Читать онлайн или скачать EPUB, FB2.`
      : `${pageDesc} Читать онлайн.`;
  }

  const hasExport = !!(pub.epubStoragePath || pub.fb2StoragePath);
  const publicationUrl = `${base}/p/${pubPath}`;

  let html = fs.readFileSync(indexPath, 'utf-8');
  html = injectPublicationMeta(html, {
    title: pageTitle,
    description: pageDesc,
    imageUrl: pub.coverImageUrl,
    pageUrl,
    isChapter: !!chapterId,
  });
  html = injectPublicationContent(html, {
    title: pageTitle,
    description: pageDesc,
    authorDisplay: pub.authorDisplay,
    translatorDisplay: pub.translatorDisplay,
    pageUrl,
    publicationUrl,
    hasExport,
  });
  html = injectPublicationJsonLd(html, {
    title: pageTitle,
    description: pageDesc,
    url: pageUrl,
    imageUrl: pub.coverImageUrl,
    authorDisplay: pub.authorDisplay,
    translatorDisplay: pub.translatorDisplay,
    targetLanguage: pub.targetLanguage,
    numberOfPages: data.chapters?.length ?? 0,
  });
  const catalogUrl = `${base}/catalog`;
  const ch = chapterId ? data.chapters.find((c) => c.id === chapterId) : null;
  html = injectBreadcrumbJsonLd(html, {
    baseUrl: base,
    catalogUrl,
    publicationName: title,
    publicationUrl: `${base}/p/${pubPath}`,
    chapterName: ch ? ch.title || `Chapter ${ch.number}` : undefined,
    chapterUrl: chapterId ? pageUrl : undefined,
  });
  res.type('html').send(html);
}

async function serveNewsDetailHtml(
  req: Request,
  res: Response,
  slugOrId: string,
  clientPath: string,
  publicPath: string
): Promise<void> {
  const base = getPublicBaseUrl(req);
  const indexPath = resolveIndexPath(clientPath, publicPath);

  const post = await getPublishedNewsPostByIdOrSlug(slugOrId);
  if (!post) {
    res.sendFile(indexPath);
    return;
  }

  const newsPath = post.slug || post.id;
  const pageUrl = `${base}/news/${newsPath}`;
  const pageDesc = post.summary.trim() || `${post.title} — новости Arcane`;

  let html = fs.readFileSync(indexPath, 'utf-8');
  html = html.replace(/__PUBLIC_URL__/g, base);
  html = injectStaticPageMeta(html, {
    title: post.title,
    description: pageDesc,
    pageUrl,
  });
  html = injectNewsContent(html, {
    title: post.title,
    summary: pageDesc,
    pageUrl,
  });
  html = injectNewsArticleJsonLd(html, {
    title: post.title,
    description: pageDesc,
    url: pageUrl,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
  });
  res.type('html').send(html);
}

/**
 * Register SEO/SSR routes: robots, sitemap, publication pages, static pages, SPA fallback.
 *
 * `afterPublicationRoutes` is invoked after publication SSR routes and before static pages —
 * use it to register `serviceUnavailableErrorHandler` and preserve middleware order in server.ts.
 */
export function registerSeoRoutes(
  app: Application,
  deps: SeoRouteDeps,
  afterPublicationRoutes?: (app: Application) => void
): void {
  const { clientPath, publicPath } = deps;

  // ============ SEO: robots.txt & sitemap.xml ============
  // Vercel rewrites /robots.txt → /api/robots, /sitemap.xml → /api/sitemap.
  // Express receives /api/robots and /api/sitemap, so we need both route sets.

  app.get('/robots.txt', sendRobotsTxt);
  app.get('/sitemap.xml', (req, res, next) => sendSitemapXml(req, res).catch(next));

  // Vercel rewrites: /robots.txt → /api/robots, /sitemap.xml → /api/sitemap
  app.get('/api/robots', sendRobotsTxt);
  app.get('/api/sitemap', (req, res, next) => sendSitemapXml(req, res).catch(next));

  // ============ SEO: Publication pages with dynamic meta ============

  app.get('/p/:publicationId', (req, res, next) => {
    servePublicationHtml(
      req,
      res,
      requireRouteParam(req.params.publicationId, 'publicationId'),
      clientPath,
      publicPath
    ).catch(next);
  });

  app.get('/p/:publicationId/chapters/:chapterId/reading', (req, res, next) => {
    servePublicationHtml(
      req,
      res,
      requireRouteParam(req.params.publicationId, 'publicationId'),
      clientPath,
      publicPath,
      requireRouteParam(req.params.chapterId, 'chapterId')
    ).catch(next);
  });

  afterPublicationRoutes?.(app);

  // ============ SEO: Static pages with dynamic meta ============
  // Serve /, /catalog, /about, /contact, /privacy, /terms with unique title, description, canonical

  app.get('/news/:slugOrId', (req, res, next) => {
    serveNewsDetailHtml(
      req,
      res,
      requireRouteParam(req.params.slugOrId, 'slugOrId'),
      clientPath,
      publicPath
    ).catch(next);
  });

  for (const p of STATIC_SEO_PATHS) {
    app.get(p, (req, res) => {
      serveStaticPageHtml(req, res, p === '/' ? '/' : p, clientPath, publicPath);
    });
  }

  // ============ SPA Fallback ============

  app.get('/{*splat}', (_req, res) => {
    res.sendFile(resolveIndexPath(clientPath, publicPath));
  });
}
