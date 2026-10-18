import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

const { consumeStoredImport } = vi.hoisted(() => ({
  consumeStoredImport: vi.fn(),
}));

vi.mock('../../../services/consumeStoredImport.js', () => ({
  consumeStoredImport,
}));

vi.mock('../../routeHelpers.js', () => ({
  decodeMultipartFilename: (name: string) => name,
}));

import { ChapterUploadSourceError } from '../../../services/importUploadPath.js';
import { readUploadedChapter } from './readUploadedChapter.js';

const options = { userId: 'user-1', projectId: 'proj-1', maxBytes: 100 };

function request(partial: Partial<Request>): Request {
  return partial as Request;
}

describe('readUploadedChapter', () => {
  it('uses a trimmed multipart filename from the body', async () => {
    const buffer = Buffer.from('chapter');
    const result = await readUploadedChapter(
      request({
        file: { buffer, originalname: 'original.txt' } as Request['file'],
        body: { filename: '  named.txt  ' },
      }),
      options
    );
    expect(result).toEqual({ buffer, filename: 'named.txt' });
    expect(consumeStoredImport).not.toHaveBeenCalled();
  });

  it('falls back to the multipart original name', async () => {
    const buffer = Buffer.from('chapter');
    const result = await readUploadedChapter(
      request({
        file: { buffer, originalname: 'original.txt' } as Request['file'],
        body: { filename: '   ' },
      }),
      options
    );
    expect(result.filename).toBe('original.txt');
  });

  it('rejects a request that is neither a file nor JSON', async () => {
    await expect(
      readUploadedChapter(request({ headers: { 'content-type': 'text/plain' } }), options)
    ).rejects.toMatchObject({ message: 'No file uploaded', status: 400 });
  });

  it('rejects an invalid JSON import body', async () => {
    await expect(
      readUploadedChapter(
        request({ headers: { 'content-type': 'application/json' }, body: {} }),
        options
      )
    ).rejects.toBeInstanceOf(ChapterUploadSourceError);
  });

  it('downloads a stored import and forwards delete failures to the request log', async () => {
    const buffer = Buffer.from('stored');
    consumeStoredImport.mockImplementation(
      async (params: { onDeleteError?: (error: unknown) => void }) => {
        params.onDeleteError?.(new Error('delete failed'));
        return buffer;
      }
    );
    const warn = vi.fn();
    const result = await readUploadedChapter(
      request({
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: { storagePath: 'user-1/proj-1/up/a.txt', filename: 'a.txt' },
        log: { warn } as unknown as Request['log'],
      }),
      options
    );

    expect(result).toEqual({ buffer, filename: 'a.txt' });
    expect(consumeStoredImport).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: 'user-1/proj-1/up/a.txt',
        userId: 'user-1',
        projectId: 'proj-1',
        maxBytes: 100,
      })
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'import.storage.delete_failed' }),
      'Failed to delete import object'
    );
  });

  it('still returns the buffer when the request has no logger', async () => {
    consumeStoredImport.mockImplementation(
      async (params: { onDeleteError?: (error: unknown) => void }) => {
        params.onDeleteError?.(new Error('delete failed'));
        return Buffer.from('stored');
      }
    );
    await expect(
      readUploadedChapter(
        request({
          headers: { 'content-type': 'application/json' },
          body: { storagePath: 'user-1/proj-1/up/a.txt', filename: 'a.txt' },
        }),
        options
      )
    ).resolves.toMatchObject({ filename: 'a.txt' });
  });
});
