import { deleteFile, downloadFile } from './storage.js';
import { assertOwnedImportPath, ChapterUploadSourceError } from './importUploadPath.js';

/** Download an import object into memory and remove it from Storage. */
export async function consumeStoredImport(params: {
  storagePath: string;
  userId: string;
  projectId: string;
  maxBytes: number;
  onDeleteError?: (error: unknown) => void;
}): Promise<Buffer> {
  const path = assertOwnedImportPath(params.storagePath, params.userId, params.projectId);
  let buffer: Buffer;
  try {
    buffer = await downloadFile('imports', path);
  } catch {
    throw new ChapterUploadSourceError('Import file not found', 404);
  }

  try {
    if (buffer.length === 0) {
      throw new ChapterUploadSourceError('Import file is empty', 400);
    }
    if (buffer.length > params.maxBytes) {
      throw new ChapterUploadSourceError('File is too large', 400);
    }
    return buffer;
  } finally {
    try {
      await deleteFile('imports', path);
    } catch (error) {
      params.onDeleteError?.(error);
    }
  }
}
