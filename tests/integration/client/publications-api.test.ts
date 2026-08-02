import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { getSupabaseMock, resetMocks } from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { installAppFetch } from '../helpers/appFetch.js';
import { samplePublication } from '../helpers/fixtures.js';
import { ApiError } from '../../../src/client/api/errors.js';

vi.hoisted(() => {
  const g = globalThis as typeof globalThis & { window?: unknown };
  g.window = {
    location: { pathname: '/', href: 'http://localhost/', search: '' },
    history: { replaceState: () => {} },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  };
});

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks());
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/publications.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { createPublicationsDomainOverlay } = await import('../helpers/mockSupabase.js');
  return { ...actual, ...createPublicationsDomainOverlay() };
});

vi.mock('../../../src/client/services/authService.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    authService: {
      getToken: () => null,
      clearStorage: vi.fn(),
      refresh: vi.fn().mockResolvedValue(false),
    },
    isReadingRoute: () => false,
    openAuthModal: vi.fn(),
  };
});

describe('client publicationsApi → Express (integration)', () => {
  let app: Application;
  let publicationsApi: typeof import('../../../src/client/api/domains/publications.js').publicationsApi;
  let resetInFlightRequests: typeof import('../../../src/client/api/transport/fetchDeduped.js').resetInFlightRequests;

  beforeAll(async () => {
    app = await bootTestApp();
    installAppFetch(app);

    const pubMod = await import('../../../src/client/api/domains/publications.js');
    publicationsApi = pubMod.publicationsApi;
    const dedupe = await import('../../../src/client/api/transport/fetchDeduped.js');
    resetInFlightRequests = dedupe.resetInFlightRequests;
  });

  beforeEach(() => {
    resetMocks();
    resetInFlightRequests();
  });

  it('getPublications() parses list from server', async () => {
    const pub = samplePublication({ id: 'pub-client-1', title: 'Client Pub' });
    getSupabaseMock('listPublicationsPublic').mockResolvedValue([pub]);

    const list = await publicationsApi.getPublications({ limit: 10, offset: 0 });

    expect(list).toEqual([pub]);
  });

  it('404 from server → ApiError with status', async () => {
    getSupabaseMock('getPublicationBySlugOrId').mockResolvedValue(null);

    await expect(publicationsApi.getPublication('missing-slug')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    } satisfies Partial<ApiError>);
  });

  it('server 500 surfaces as ApiError', async () => {
    getSupabaseMock('getPublicationBySlugOrId').mockRejectedValue(new Error('boom'));

    await expect(publicationsApi.getPublication('x')).rejects.toBeInstanceOf(ApiError);
  });
});
