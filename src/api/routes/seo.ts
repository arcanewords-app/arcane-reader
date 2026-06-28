import type { Application, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  listPublicationsPublic,
  getPublicationWithChapters,
  listPublishedNewsPosts,
  getPublishedNewsPostByIdOrSlug,
} from '../../services/supabaseDatabase.js';
import { logger } from '../../logger.js';
import { buildRobotsTxt } from '../../shared/robotsTxt.js';
import { STATIC_PAGE_META, staticPageDocumentTitle } from '../../shared/staticPageMeta.js';
import { requireRouteParam } from '../validateRoute.js';

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape string for use in HTML meta content attribute (quotes, ampersands) */
function escapeMetaContent(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Absolute site origin; respects X-Forwarded-* behind Vercel/reverse proxies. */
function getPublicBaseUrl(req: Request): string {
  const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol || 'https';
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host') || 'localhost';
  return `${proto}://${host}`;
}

/**
 * Inject publication-specific meta tags into index.html for SEO (Open Graph, Twitter Card).
 * Used for /p/:id and /p/:id/chapters/:cid/reading routes so crawlers get correct previews.
 */
function injectPublicationMeta(
  html: string,
  opts: {
    title: string;
    description: string;
    imageUrl: string | null;
    pageUrl: string;
    isChapter?: boolean;
  }
): string {
  const t = escapeMetaContent(opts.title);
  const d = escapeMetaContent(opts.description);
  const origin = opts.pageUrl.startsWith('http') ? new URL(opts.pageUrl).origin : '';
  const img =
    opts.imageUrl && opts.imageUrl.startsWith('http') ? opts.imageUrl : `${origin}/arcane_icon.png`;
  const url = escapeMetaContent(opts.pageUrl);
  const titleSuffix = opts.isChapter ? ' — Arcane' : ' — читать онлайн | Arcane';

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}${titleSuffix}</title>`)
    .replace(
      /<meta name="description" content="[^"]*" *\/?>/,
      `<meta name="description" content="${d}" />`
    )
    .replace(
      /<meta property="og:title" content="[^"]*" *\/?>/,
      `<meta property="og:title" content="${t}" />`
    )
    .replace(
      /<meta property="og:description" content="[^"]*" *\/?>/,
      `<meta property="og:description" content="${d}" />`
    )
    .replace(
      /<meta property="og:image" content="[^"]*" *\/?>/,
      `<meta property="og:image" content="${img}" />`
    );
  if (!out.includes('og:url')) {
    out = out.replace(
      /<meta property="og:type" content="[^"]*" *\/?>/,
      `<meta property="og:url" content="${url}" />\n    <meta property="og:type" content="website" />`
    );
  } else {
    out = out.replace(
      /<meta property="og:url" content="[^"]*" *\/?>/,
      `<meta property="og:url" content="${url}" />`
    );
  }
  out = out
    .replace(
      /<meta name="twitter:title" content="[^"]*" *\/?>/,
      `<meta name="twitter:title" content="${t}" />`
    )
    .replace(
      /<meta name="twitter:description" content="[^"]*" *\/?>/,
      `<meta name="twitter:description" content="${d}" />`
    );
  if (out.includes('name="twitter:image"')) {
    out = out.replace(
      /<meta name="twitter:image" content="[^"]*" *\/?>/,
      `<meta name="twitter:image" content="${img}" />`
    );
  } else {
    out = out.replace(
      /<meta name="twitter:description" content="[^"]*" *\/?>/,
      `<meta name="twitter:description" content="${d}" />\n    <meta name="twitter:image" content="${img}" />`
    );
  }

  const canonicalTag = `<link rel="canonical" href="${url}" />`;
  if (out.includes('rel="canonical"')) {
    out = out.replace(/<link rel="canonical" href="[^"]*" *\/?>/i, canonicalTag);
  } else {
    out = out.replace('</head>', `    ${canonicalTag}\n  </head>`);
  }
  return out;
}

/**
 * Inject static page meta (title, description, og:*, canonical) into index.html.
 * For / and /catalog: canonical points to / (avoid duplicate content).
 */
function injectStaticPageMeta(
  html: string,
  opts: {
    title: string;
    description: string;
    pageUrl: string;
    canonicalUrl?: string;
  }
): string {
  const t = escapeMetaContent(opts.title);
  const d = escapeMetaContent(opts.description);
  const origin = opts.pageUrl.startsWith('http') ? new URL(opts.pageUrl).origin : '';
  const img = `${origin}/arcane_icon.png`;
  const url = escapeMetaContent(opts.pageUrl);
  const canonicalUrl = opts.canonicalUrl ? escapeMetaContent(opts.canonicalUrl) : url;
  const documentTitle = escapeMetaContent(staticPageDocumentTitle(opts.title));

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${documentTitle}</title>`)
    .replace(
      /<meta name="description" content="[^"]*" *\/?>/,
      `<meta name="description" content="${d}" />`
    )
    .replace(
      /<meta property="og:title" content="[^"]*" *\/?>/,
      `<meta property="og:title" content="${t}" />`
    )
    .replace(
      /<meta property="og:description" content="[^"]*" *\/?>/,
      `<meta property="og:description" content="${d}" />`
    )
    .replace(
      /<meta property="og:image" content="[^"]*" *\/?>/,
      `<meta property="og:image" content="${img}" />`
    );
  if (!out.includes('og:url')) {
    out = out.replace(
      /<meta property="og:type" content="[^"]*" *\/?>/,
      `<meta property="og:url" content="${url}" />\n    <meta property="og:type" content="website" />`
    );
  } else {
    out = out.replace(
      /<meta property="og:url" content="[^"]*" *\/?>/,
      `<meta property="og:url" content="${url}" />`
    );
  }
  out = out
    .replace(
      /<meta name="twitter:title" content="[^"]*" *\/?>/,
      `<meta name="twitter:title" content="${t}" />`
    )
    .replace(
      /<meta name="twitter:description" content="[^"]*" *\/?>/,
      `<meta name="twitter:description" content="${d}" />`
    );
  if (out.includes('name="twitter:image"')) {
    out = out.replace(
      /<meta name="twitter:image" content="[^"]*" *\/?>/,
      `<meta name="twitter:image" content="${img}" />`
    );
  } else {
    out = out.replace(
      /<meta name="twitter:description" content="[^"]*" *\/?>/,
      `<meta name="twitter:description" content="${d}" />\n    <meta name="twitter:image" content="${img}" />`
    );
  }

  const canonicalTag = `<link rel="canonical" href="${canonicalUrl}" />`;
  if (out.includes('rel="canonical"')) {
    out = out.replace(/<link rel="canonical" href="[^"]*" *\/?>/i, canonicalTag);
  } else {
    out = out.replace('</head>', `    ${canonicalTag}\n  </head>`);
  }
  return out;
}

/** Inject NewsArticle JSON-LD for news detail pages. */
function injectNewsArticleJsonLd(
  html: string,
  opts: {
    title: string;
    description: string;
    url: string;
    datePublished: string | null;
    dateModified: string;
  }
): string {
  const base = opts.url.startsWith('http') ? new URL(opts.url).origin : '';
  const article: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: opts.title,
    description: opts.description,
    url: opts.url,
    image: `${base}/arcane_icon.png`,
    publisher: {
      '@type': 'Organization',
      name: 'Arcane',
      url: base,
    },
    dateModified: opts.dateModified,
  };
  if (opts.datePublished) {
    article.datePublished = opts.datePublished;
  }
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(article)}</script>`;
  return html.replace('</head>', `    ${jsonLd}\n  </head>`);
}

/** Inject visible news content into #app for crawlers. */
function injectNewsContent(
  html: string,
  opts: { title: string; summary: string; pageUrl: string }
): string {
  const title = escapeHtml(opts.title);
  const summary = escapeHtml(
    opts.summary.length > 400 ? opts.summary.slice(0, 397) + '...' : opts.summary
  );
  const content = `<main class="news-page-seo" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true">
    <h1>${title}</h1>
    <p class="news-page-seo-summary">${summary}</p>
    <p><a href="${escapeHtml(opts.pageUrl)}">Читать на Arcane</a></p>
  </main>`;
  return html.replace(/<div id="app">\s*<\/div>/, `<div id="app">${content}</div>`);
}

/** Inject Organization + WebSite JSON-LD for homepage. */
function injectOrganizationJsonLd(html: string, baseUrl: string): string {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Arcane',
    url: baseUrl,
    description: 'Arcane — библиотека переводов новелл. Переводчик с AI и глоссарием. EPUB, FB2.',
  };
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Arcane',
    url: baseUrl,
    description:
      'Библиотека переводов новелл. Читайте и скачивайте переводы онлайн. Переводчик с AI.',
  };
  const jsonLd =
    `<script type="application/ld+json">${JSON.stringify(org)}</script>\n    ` +
    `<script type="application/ld+json">${JSON.stringify(website)}</script>`;
  return html.replace('</head>', `    ${jsonLd}\n  </head>`);
}

function resolveIndexPath(clientPath: string, publicPath: string): string {
  return fs.existsSync(path.join(clientPath, 'index.html'))
    ? path.join(clientPath, 'index.html')
    : path.join(publicPath, 'index.html');
}

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

/**
 * Inject visible content into #app for crawlers (SPA renders empty HTML otherwise).
 * H1, description, author, links "Читать онлайн" and "Скачать" so bots see intent.
 */
function injectPublicationContent(
  html: string,
  opts: {
    title: string;
    description: string;
    authorDisplay: string | null;
    translatorDisplay: string | null;
    pageUrl: string;
    publicationUrl: string;
    hasExport: boolean;
  }
): string {
  const title = escapeHtml(opts.title);
  const desc = escapeHtml(
    opts.description.length > 400 ? opts.description.slice(0, 397) + '...' : opts.description
  );
  const author = opts.authorDisplay ? escapeHtml(opts.authorDisplay) : '';
  const translator = opts.translatorDisplay ? escapeHtml(opts.translatorDisplay) : '';
  const metaParts: string[] = [];
  if (author) metaParts.push(`Автор: ${author}`);
  if (translator) metaParts.push(`Переводчик: ${translator}`);
  const metaLine =
    metaParts.length > 0 ? `<p class="publication-page-seo-meta">${metaParts.join(' · ')}</p>` : '';

  const readLink = `<a href="${escapeHtml(opts.publicationUrl)}">Читать онлайн</a>`;
  const downloadLink = opts.hasExport
    ? `<a href="${escapeHtml(opts.publicationUrl)}#download">Скачать EPUB, FB2</a>`
    : '';
  const actionLinks = opts.hasExport ? `${readLink} · ${downloadLink}` : readLink;

  const content = `<main class="publication-page-seo" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true">
    <h1>${title}</h1>
    <p class="publication-page-seo-desc">${desc}</p>
    ${metaLine}
    <p class="publication-page-seo-actions">${actionLinks}</p>
  </main>`;

  return html.replace(/<div id="app">\s*<\/div>/, `<div id="app">${content}</div>`);
}

/**
 * Inject JSON-LD Book schema for publication pages (schema.org).
 */
function injectPublicationJsonLd(
  html: string,
  opts: {
    title: string;
    description: string;
    url: string;
    imageUrl: string | null;
    authorDisplay: string | null;
    translatorDisplay: string | null;
    targetLanguage: string;
    numberOfPages?: number;
  }
): string {
  const base = opts.url.startsWith('http') ? new URL(opts.url).origin : '';
  const img =
    opts.imageUrl && opts.imageUrl.startsWith('http')
      ? opts.imageUrl
      : opts.imageUrl
        ? `${base}${opts.imageUrl.startsWith('/') ? '' : '/'}${opts.imageUrl}`
        : base
          ? `${base}/arcane_icon.png`
          : '/arcane_icon.png';

  const book: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: opts.title,
    description: opts.description,
    url: opts.url,
    image: img,
    inLanguage: opts.targetLanguage,
  };
  if (opts.authorDisplay) {
    (book as Record<string, unknown>).author = { '@type': 'Person', name: opts.authorDisplay };
  }
  if (opts.translatorDisplay) {
    (book as Record<string, unknown>).translator = {
      '@type': 'Person',
      name: opts.translatorDisplay,
    };
  }
  if (opts.numberOfPages != null && opts.numberOfPages > 0) {
    (book as Record<string, unknown>).numberOfPages = opts.numberOfPages;
  }

  const jsonLd = `<script type="application/ld+json">${JSON.stringify(book)}</script>`;
  return html.replace('</head>', `    ${jsonLd}\n  </head>`);
}

/**
 * Inject BreadcrumbList JSON-LD for publication pages.
 */
function injectBreadcrumbJsonLd(
  html: string,
  opts: {
    baseUrl: string;
    catalogUrl: string;
    publicationName: string;
    publicationUrl: string;
    chapterName?: string;
    chapterUrl?: string;
  }
): string {
  const items: Array<{
    '@type': string;
    position: number;
    name: string;
    item: string;
  }> = [
    { '@type': 'ListItem', position: 1, name: 'Каталог', item: opts.catalogUrl },
    {
      '@type': 'ListItem',
      position: 2,
      name: opts.publicationName,
      item: opts.publicationUrl,
    },
  ];
  if (opts.chapterName && opts.chapterUrl) {
    items.push({
      '@type': 'ListItem',
      position: 3,
      name: opts.chapterName,
      item: opts.chapterUrl,
    });
  }
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`;
  return html.replace('</head>', `    ${jsonLd}\n  </head>`);
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
