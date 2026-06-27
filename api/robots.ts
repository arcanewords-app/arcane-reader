/**
 * Vercel serverless function for /api/robots (rewrite target for /robots.txt)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildRobotsTxt } from '../src/shared/robotsTxt.js';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'arcane-reader.com';
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  const base = `${proto}://${host}`;

  res.setHeader('Content-Type', 'text/plain');
  res.send(buildRobotsTxt(base));
}
