/**
 * Vercel serverless function for /api/sitemap (rewrite target for /sitemap.xml).
 * Uses raw Node ServerResponse — VercelResponse helpers may be missing on the Rust runtime.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import '../src/loadEnv.js';
import {
  listPublicationsPublic,
  getPublicationWithChapters,
  listPublishedNewsPosts,
} from '../src/services/supabaseDatabase.js';

function requestBase(req: IncomingMessage): string {
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'arcane-reader.com';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const protoHeader = req.headers['x-forwarded-proto'] ?? 'https';
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  return `${proto}://${host}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SITEMAP_CHAPTER_PUBS_LIMIT = 100;
const SITEMAP_NEWS_LIMIT = 100;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const base = requestBase(req);

  let pubUrls = '';
  let chapterUrls = '';
  try {
    const pubs = await listPublicationsPublic({ limit: 1000 });
    for (const p of pubs) {
      const pubPath = (p as { slug?: string | null }).slug ?? p.id;
      const lastmod = p.updatedAt
        ? `<lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod>\n    `
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
      const pubPath = (p as { slug?: string | null }).slug ?? p.id;
      try {
        const data = await getPublicationWithChapters(pubPath);
        if (!data?.chapters?.length) continue;
        const firstTranslated = data.chapters.find((c) => c.hasTranslation);
        if (!firstTranslated) continue;
        const lastmod = p.updatedAt
          ? `<lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod>\n    `
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
  } catch {
    /* return partial sitemap */
  }

  let newsUrls = '';
  try {
    const posts = await listPublishedNewsPosts({ limit: SITEMAP_NEWS_LIMIT });
    for (const post of posts) {
      const slug = post.slug || post.id;
      const lastmod = post.updatedAt
        ? `<lastmod>${new Date(post.updatedAt).toISOString().slice(0, 10)}</lastmod>\n    `
        : '';
      newsUrls += `  <url>
    <loc>${escapeHtml(base + '/news/' + slug)}</loc>
    ${lastmod}<changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`;
    }
  } catch {
    /* return partial sitemap */
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeHtml(base + '/')}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${staticPages}${pubUrls}${chapterUrls}${newsUrls}</urlset>
`;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml');
  res.end(xml);
}
