/**
 * Vercel serverless function for /api/robots (rewrite target for /robots.txt).
 * Uses raw Node ServerResponse — VercelResponse helpers may be missing on the Rust runtime.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildRobotsTxt } from '../src/shared/robotsTxt.js';

function requestBase(req: IncomingMessage): string {
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'arcane-reader.com';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const protoHeader = req.headers['x-forwarded-proto'] ?? 'https';
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  return `${proto}://${host}`;
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end(buildRobotsTxt(requestBase(req)));
}
