import { afterEach, describe, expect, it, vi } from 'vitest';

const { downloadFile, deleteFile } = vi.hoisted(() => ({
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('./storage.js', () => ({
  downloadFile,
  deleteFile,
}));

import { ChapterUploadSourceError } from './importUploadPath.js';
import { consumeStoredImport } from './consumeStoredImport.js';

const params = {
  storagePath: 'user-1/proj-1/upload-1/chapter.txt',
  userId: 'user-1',
  projectId: 'proj-1',
  maxBytes: 10,
};

describe('consumeStoredImport', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the file and deletes the storage object', async () => {
    downloadFile.mockResolvedValue(Buffer.from('hello'));
    deleteFile.mockResolvedValue(undefined);

    const buffer = await consumeStoredImport(params);

    expect(buffer.toString()).toBe('hello');
    expect(downloadFile).toHaveBeenCalledWith('imports', params.storagePath);
    expect(deleteFile).toHaveBeenCalledWith('imports', params.storagePath);
  });

  it('rejects a missing, empty, or oversized object and still deletes it', async () => {
    downloadFile.mockRejectedValue(new Error('missing'));
    await expect(consumeStoredImport(params)).rejects.toMatchObject({
      message: 'Import file not found',
      status: 404,
    });
    expect(deleteFile).not.toHaveBeenCalled();

    downloadFile.mockResolvedValue(Buffer.alloc(0));
    deleteFile.mockResolvedValue(undefined);
    await expect(consumeStoredImport(params)).rejects.toBeInstanceOf(ChapterUploadSourceError);
    await expect(consumeStoredImport(params)).rejects.toMatchObject({
      message: 'Import file is empty',
      status: 400,
    });

    downloadFile.mockResolvedValue(Buffer.alloc(11));
    await expect(consumeStoredImport(params)).rejects.toMatchObject({
      message: 'File is too large',
      status: 400,
    });
    expect(deleteFile).toHaveBeenCalled();
  });

  it('reports a delete failure without hiding the downloaded buffer', async () => {
    downloadFile.mockResolvedValue(Buffer.from('ok'));
    const deleteError = new Error('delete failed');
    deleteFile.mockRejectedValue(deleteError);
    const onDeleteError = vi.fn();

    await expect(consumeStoredImport({ ...params, onDeleteError })).resolves.toBeInstanceOf(Buffer);
    expect(onDeleteError).toHaveBeenCalledWith(deleteError);
  });

  it('rejects a path that is not owned by the user and project', async () => {
    await expect(
      consumeStoredImport({ ...params, storagePath: 'other/proj-1/upload-1/chapter.txt' })
    ).rejects.toMatchObject({ message: 'Invalid import path', status: 403 });
    expect(downloadFile).not.toHaveBeenCalled();
  });
});
