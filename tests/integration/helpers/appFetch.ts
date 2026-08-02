/**
 * Convert Fetch API calls into supertest against the Express app,
 * so client domain modules can run unchanged in Node integration tests.
 */

import type { Application } from 'express';
import request from 'supertest';

function resolvePath(input: RequestInfo | URL): { path: string; methodHint?: string } {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const u = new URL(raw);
    return { path: `${u.pathname}${u.search}` };
  }
  return { path: raw.startsWith('/') ? raw : `/${raw}` };
}

export async function appFetch(
  app: Application,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const { path } = resolvePath(input);
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  const contentType = headers.get('content-type') ?? '';

  let req = request(app)[method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](path);

  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-length') return;
    req = req.set(key, value);
  });

  if (init?.body != null && method !== 'GET' && method !== 'HEAD') {
    if (typeof init.body === 'string') {
      if (contentType.includes('application/json') || init.body.trim().startsWith('{')) {
        req = req.send(JSON.parse(init.body));
      } else {
        req = req.send(init.body);
      }
    } else {
      req = req.send(init.body as object);
    }
  }

  const res = await req;
  const bodyText =
    typeof res.text === 'string' && res.text.length > 0
      ? res.text
      : res.body !== undefined
        ? JSON.stringify(res.body)
        : '';

  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value == null) continue;
    responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  if (!responseHeaders.has('content-type') && bodyText) {
    responseHeaders.set('content-type', 'application/json');
  }

  return new Response(bodyText, {
    status: res.status,
    headers: responseHeaders,
  });
}

/** Install global fetch that routes relative /api/* URLs to the Express app. */
export function installAppFetch(app: Application): void {
  const originalFetch = globalThis.fetch?.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const { path } = resolvePath(input);
    if (path.startsWith('/api') || path.startsWith('api')) {
      return appFetch(app, input, init);
    }
    if (originalFetch) {
      return originalFetch(input, init);
    }
    throw new Error(`appFetch: unhandled fetch URL ${String(input)}`);
  }) as typeof fetch;
}
