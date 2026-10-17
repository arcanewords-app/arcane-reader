import { randomUUID } from 'node:crypto';

export class ChapterUploadSourceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ChapterUploadSourceError';
  }
}

export function sanitizeImportFilename(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() || 'upload';
  const cleaned = base.replace(/[^\w.\- ()\u0080-\uFFFF]+/g, '_').slice(0, 180);
  return cleaned || 'upload';
}

export function buildImportStoragePath(
  userId: string,
  projectId: string,
  filename: string,
  uploadId: string = randomUUID()
): string {
  return `${userId}/${projectId}/${uploadId}/${sanitizeImportFilename(filename)}`;
}

/** Accept only objects stored under this user and project. */
export function assertOwnedImportPath(
  storagePath: string,
  userId: string,
  projectId: string
): string {
  if (
    !userId ||
    !projectId ||
    userId.includes('/') ||
    projectId.includes('/') ||
    userId.includes('..') ||
    projectId.includes('..')
  ) {
    throw new ChapterUploadSourceError('Invalid import path', 403);
  }
  const normalized = storagePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (
    !normalized ||
    normalized.includes('..') ||
    normalized.includes('\0') ||
    normalized.includes('//')
  ) {
    throw new ChapterUploadSourceError('Invalid import path', 403);
  }
  const prefix = `${userId}/${projectId}/`;
  if (!normalized.startsWith(prefix) || normalized.length <= prefix.length) {
    throw new ChapterUploadSourceError('Invalid import path', 403);
  }
  return normalized;
}
