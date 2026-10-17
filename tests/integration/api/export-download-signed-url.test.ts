import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  createProjectsDomainOverlay,
  createPublicationsDomainOverlay,
  getSupabaseMock,
  resetMocks,
} from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleProject, samplePublication } from '../helpers/fixtures.js';

const storageMocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/supabase/domains/publications.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createPublicationsDomainOverlay() };
});
vi.mock('../../../src/services/storage.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createSignedUrl: (...args: unknown[]) => storageMocks.createSignedUrl(...args),
    downloadFile: (...args: unknown[]) => storageMocks.downloadFile(...args),
  };
});

describe('export download signed urls (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
    storageMocks.createSignedUrl.mockReset();
    storageMocks.downloadFile.mockReset();
    storageMocks.createSignedUrl.mockResolvedValue({
      signedUrl: 'https://signed.example/book.epub',
    });
  });

  it('returns a signed url for an owned project export and does not stream the file', async () => {
    getSupabaseMock('getProject').mockResolvedValue(sampleProject());

    const res = await request(app)
      .get('/api/projects/proj-1/export/download')
      .query({ path: 'proj-1/book.epub' })
      .set('Authorization', 'Bearer tok');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://signed.example/book.epub', filename: 'book.epub' });
    expect(res.headers['content-type']).toMatch(/json/);
    expect(storageMocks.downloadFile).not.toHaveBeenCalled();
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('exports', 'proj-1/book.epub', 1800, {
      download: 'book.epub',
    });
  });

  it('rejects a project export path outside the project', async () => {
    const res = await request(app)
      .get('/api/projects/proj-1/export/download')
      .query({ path: 'other/book.epub' })
      .set('Authorization', 'Bearer tok');

    expect(res.status).toBe(403);
    expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
    expect(storageMocks.downloadFile).not.toHaveBeenCalled();
  });

  it('returns a signed url for a published export', async () => {
    getSupabaseMock('getPublicationBySlugOrId').mockResolvedValue(
      samplePublication({ epubStoragePath: 'publication-pub-1/book.epub' })
    );

    const res = await request(app)
      .get('/api/publications/pub-1/download')
      .query({ format: 'epub' })
      .set('Authorization', 'Bearer tok');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://signed.example/book.epub', filename: 'book.epub' });
    expect(storageMocks.downloadFile).not.toHaveBeenCalled();
  });
});
