import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  ChapterUploadSourceError,
  assertOwnedImportPath,
  buildImportStoragePath,
  sanitizeImportFilename,
} from './importUploadPath.js';

describe('import upload paths', () => {
  it('keeps a safe basename', () => {
    assert.equal(sanitizeImportFilename('../Result_252.csv'), 'Result_252.csv');
    assert.equal(sanitizeImportFilename('глава 1.txt'), 'глава 1.txt');
  });

  it('builds a path scoped to the user and project', () => {
    const path = buildImportStoragePath('user-1', 'proj-1', 'book.csv', 'up-1');
    assert.equal(path, 'user-1/proj-1/up-1/book.csv');
  });

  it('accepts an owned path and rejects a foreign one', () => {
    assert.equal(
      assertOwnedImportPath('user-1/proj-1/up-1/book.csv', 'user-1', 'proj-1'),
      'user-1/proj-1/up-1/book.csv'
    );
    assert.throws(
      () => assertOwnedImportPath('other/proj-1/up-1/book.csv', 'user-1', 'proj-1'),
      (error: unknown) => error instanceof ChapterUploadSourceError && error.status === 403
    );
    assert.throws(
      () => assertOwnedImportPath('user-1/proj-1/../secret.csv', 'user-1', 'proj-1'),
      (error: unknown) => error instanceof ChapterUploadSourceError && error.status === 403
    );
  });
});
