/**
 * Vercel serverless function for /api/sitemap (rewrite target for /sitemap.xml)
 */
import 'dotenv/config';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  listPublicationsPublic,
  getPublicationWithChapters,
} from '../src/services/supabaseDatabase.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SITEMAP_CHAPTER_PUBS_LIMIT = 100;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'arcane-reader.com';
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  const base = `${proto}://${host}`;

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

  const staticPages = ['/about', '/contact', '/privacy', '/terms', '/catalog']
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
${staticPages}${pubUrls}${chapterUrls}</urlset>
`;

  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
}
