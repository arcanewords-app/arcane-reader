import type { Request } from 'express';
import { importFromStorageBodySchema } from '../../schemas/chapters.js';
import { decodeMultipartFilename } from '../../routeHelpers.js';
import { consumeStoredImport } from '../../../services/consumeStoredImport.js';
import { ChapterUploadSourceError } from '../../../services/importUploadPath.js';

export async function readUploadedChapter(
  req: Request,
  options: {
    userId: string;
    projectId: string;
    maxBytes: number;
  }
): Promise<{ buffer: Buffer; filename: string }> {
  if (req.file) {
    const filename =
      typeof req.body?.filename === 'string' && req.body.filename.trim()
        ? req.body.filename.trim()
        : decodeMultipartFilename(req.file.originalname);
    return { buffer: req.file.buffer, filename };
  }

  const contentType = String(req.headers?.['content-type'] ?? '');
  if (!contentType.includes('application/json')) {
    throw new ChapterUploadSourceError('No file uploaded', 400);
  }

  const parsed = importFromStorageBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ChapterUploadSourceError(
      'Validation failed',
      400,
      parsed.error.flatten().fieldErrors
    );
  }

  const buffer = await consumeStoredImport({
    storagePath: parsed.data.storagePath,
    userId: options.userId,
    projectId: options.projectId,
    maxBytes: options.maxBytes,
    onDeleteError: (error) => {
      req.log?.warn(
        { err: error, event: 'import.storage.delete_failed' },
        'Failed to delete import object'
      );
    },
  });
  return { buffer, filename: parsed.data.filename };
}
