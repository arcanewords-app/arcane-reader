import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import {
  createProjectsDomainOverlay,
  getSupabaseMock,
  resetMocks,
} from '../helpers/mockSupabase.js';
import { bootTestApp } from '../helpers/createTestApp.js';
import { sampleProject, TEST_USER_ID } from '../helpers/fixtures.js';

const storageMocks = vi.hoisted(() => ({
  createSignedUploadUrl: vi.fn(),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
  runAsyncImportJob: vi.fn(),
}));

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/projects.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createProjectsDomainOverlay() };
});
vi.mock('../../../src/services/storage.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createSignedUploadUrl: (...args: unknown[]) => storageMocks.createSignedUploadUrl(...args),
    downloadFile: (...args: unknown[]) => storageMocks.downloadFile(...args),
    deleteFile: (...args: unknown[]) => storageMocks.deleteFile(...args),
  };
});
vi.mock('../../../src/api/chapters/helpers/asyncImportJob.js', () => ({
  runAsyncImportJob: (...args: unknown[]) => storageMocks.runAsyncImportJob(...args),
}));

const UPLOAD_URL = '/api/projects/proj-1/chapters/import/upload-url';
const IMPORT_URL = '/api/projects/proj-1/chapters/import';

describe('chapter import via storage (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    resetMocks();
    storageMocks.createSignedUploadUrl.mockReset();
    storageMocks.downloadFile.mockReset();
    storageMocks.deleteFile.mockReset();
    storageMocks.runAsyncImportJob.mockReset();
    getSupabaseMock('getProject').mockResolvedValue(sampleProject());
  });

  it('returns a signed upload url scoped to the author project', async () => {
    storageMocks.createSignedUploadUrl.mockImplementation(
      async (_bucket: string, path: string) => ({
        signedUrl: 'https://storage.example/upload',
        token: 'signed-token',
        path,
      })
    );

    const res = await request(app)
      .post(UPLOAD_URL)
      .set('Authorization', 'Bearer tok')
      .send({ filename: 'Result_252.csv', byteSize: 5 * 1024 * 1024 });

    expect(res.status).toBe(200);
    expect(res.body.signedUrl).toBe('https://storage.example/upload');
    expect(res.body.path).toMatch(new RegExp(`^${TEST_USER_ID}/proj-1/.+/Result_252.csv$`));
    expect(storageMocks.createSignedUploadUrl).toHaveBeenCalledWith('imports', res.body.path);
  });

  it('rejects a storage path owned by someone else', async () => {
    const res = await request(app).post(IMPORT_URL).set('Authorization', 'Bearer tok').send({
      storagePath: 'other-user/proj-1/up/book.csv',
      filename: 'book.csv',
      title: 'Book',
    });

    expect(res.status).toBe(403);
    expect(storageMocks.downloadFile).not.toHaveBeenCalled();
    expect(storageMocks.runAsyncImportJob).not.toHaveBeenCalled();
  });

  it('starts an import job from an owned storage object and deletes it', async () => {
    const csv = Buffer.from('title,text\nChapter,Hello\n');
    storageMocks.downloadFile.mockResolvedValue(csv);
    storageMocks.deleteFile.mockResolvedValue(undefined);
    storageMocks.runAsyncImportJob.mockResolvedValue(undefined);
    const storagePath = `${TEST_USER_ID}/proj-1/up-1/book.csv`;

    const res = await request(app).post(IMPORT_URL).set('Authorization', 'Bearer tok').send({
      storagePath,
      filename: 'book.csv',
      title: 'Book',
    });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'queued' });
    expect(storageMocks.downloadFile).toHaveBeenCalledWith('imports', storagePath);
    expect(storageMocks.deleteFile).toHaveBeenCalledWith('imports', storagePath);

    await new Promise((resolve) => setImmediate(resolve));
    expect(storageMocks.runAsyncImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        userId: TEST_USER_ID,
        filename: 'book.csv',
        extension: 'csv',
        buffer: csv,
      })
    );
  });
});
