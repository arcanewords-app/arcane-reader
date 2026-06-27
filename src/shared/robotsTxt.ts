/** robots.txt body — SSOT for Express and Vercel serverless. */
export function buildRobotsTxt(base: string): string {
  return `User-agent: *
Allow: /
Disallow: /profile
Disallow: /translation-requests
Disallow: /projects
Disallow: /admin

Sitemap: ${base}/sitemap.xml
`;
}
