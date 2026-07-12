import type { Request } from 'express';
import { staticPageDocumentTitle } from '../../../shared/staticPageMeta.js';
import { escapeHtml, escapeMetaContent } from '../../../shared/seoHtml.js';

/** Absolute site origin; respects X-Forwarded-* behind Vercel/reverse proxies. */
export function getPublicBaseUrl(req: Request): string {
  const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol || 'https';
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host') || 'localhost';
  return `${proto}://${host}`;
}

/**
 * Inject publication-specific meta tags into index.html for SEO (Open Graph, Twitter Card).
 * Used for /p/:id and /p/:id/chapters/:cid/reading routes so crawlers get correct previews.
 */
export function injectPublicationMeta(
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
export function injectStaticPageMeta(
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
export function injectNewsArticleJsonLd(
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
export function injectNewsContent(
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
export function injectOrganizationJsonLd(html: string, baseUrl: string): string {
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

/**
 * Inject visible content into #app for crawlers (SPA renders empty HTML otherwise).
 * H1, description, author, links "Читать онлайн" and "Скачать" so bots see intent.
 */
export function injectPublicationContent(
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
export function injectPublicationJsonLd(
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
export function injectBreadcrumbJsonLd(
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
