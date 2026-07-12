import { describe, expect, it, vi } from 'vitest';
import {
  appendChapterCountWarning,
  appendRecentChapterSnapshot,
  applyCoverImageToMetadata,
  buildMultiChapterImportResponse,
  buildRecentChapterSnapshotEntries,
  flushImportBatch,
  importMetadataChanged,
  mergeImportMetadata,
  resolveImportMetadataUpdate,
  shouldUpdateProjectType,
} from './importPipeline.js';

describe('importPipeline', () => {
  it('shouldUpdateProjectType when unset or text→book', () => {
    expect(shouldUpdateProjectType(undefined, 'book')).toBe(true);
    expect(shouldUpdateProjectType('text', 'book')).toBe(true);
    expect(shouldUpdateProjectType('book', 'book')).toBe(false);
  });

  it('mergeImportMetadata and importMetadataChanged', () => {
    const merged = mergeImportMetadata({ a: 1 }, { b: 2 });
    expect(merged).toEqual({ a: 1, b: 2 });
    expect(importMetadataChanged({ a: 1 }, { a: 1, b: 2 })).toBe(true);
    expect(importMetadataChanged({ a: 1 }, { a: 1 })).toBe(false);
  });

  it('appendChapterCountWarning adds warning above threshold', () => {
    const warnings = appendChapterCountWarning([], 600);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('600');
  });

  it('flushImportBatch skips empty batch', async () => {
    const fn = vi.fn();
    expect(await flushImportBatch(fn, 'p1', [], 'token')).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flushImportBatch delegates to importChaptersBatch', async () => {
    const rows = [{ sourceIndex: 0, chapterId: 'c1', number: 1, title: 'T', paragraphsCount: 1 }];
    const fn = vi.fn().mockResolvedValue(rows);
    const batch = [{ title: 'T', originalText: 'text' }];
    expect(await flushImportBatch(fn, 'p1', batch, 'token', { useServiceRole: true })).toEqual(
      rows
    );
    expect(fn).toHaveBeenCalledWith('p1', batch, 'token', { useServiceRole: true });
  });

  it('appendRecentChapterSnapshot trims to max', () => {
    const recent = [{ number: 1, title: 'A' }];
    const next = appendRecentChapterSnapshot(recent, [{ number: 2, title: 'B' }], 1);
    expect(next).toEqual([{ number: 2, title: 'B' }]);
  });

  it('buildMultiChapterImportResponse shapes API payload', () => {
    const body = buildMultiChapterImportResponse(
      [{ sourceIndex: 0, chapterId: 'c1', number: 1, title: 'Ch', paragraphsCount: 3 }],
      ['warn']
    );
    expect(body.count).toBe(1);
    expect(body.chapters[0].status).toBe('pending');
    expect(body.warnings).toEqual(['warn']);
  });

  it('applyCoverImageToMetadata uploads and strips coverImage', async () => {
    const upload = vi.fn().mockResolvedValue({ publicUrl: 'https://cdn/cover.jpg' });
    const result = await applyCoverImageToMetadata(
      { title: 'Book', coverImage: { data: Buffer.from('x'), mimeType: 'image/jpeg' } },
      { data: Buffer.from('x'), mimeType: 'image/jpeg' },
      'proj-1',
      upload
    );
    expect(result.coverImageUrl).toBe('https://cdn/cover.jpg');
    expect(result.coverImage).toBeUndefined();
    expect(upload).toHaveBeenCalled();
  });

  it('resolveImportMetadataUpdate returns null when parsed metadata empty', async () => {
    const upload = vi.fn();
    expect(await resolveImportMetadataUpdate({ title: 'Old' }, undefined, 'p1', upload)).toBeNull();
    expect(await resolveImportMetadataUpdate({ title: 'Old' }, {}, 'p1', upload)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('resolveImportMetadataUpdate returns null when merge yields no diff', async () => {
    const upload = vi.fn();
    expect(
      await resolveImportMetadataUpdate({ title: 'Same' }, { title: 'Same' }, 'p1', upload)
    ).toBeNull();
  });

  it('resolveImportMetadataUpdate applies cover and returns merged metadata', async () => {
    const upload = vi.fn().mockResolvedValue({ publicUrl: 'https://cdn/cover.jpg' });
    const onCoverSaved = vi.fn();
    const result = await resolveImportMetadataUpdate(
      { title: 'Old' },
      {
        title: 'New',
        coverImage: { data: Buffer.from('img'), mimeType: 'image/png' },
      },
      'proj-1',
      upload,
      {
        buildCoverPath: (id, mime) => `${id}/custom.${mime.split('/')[1]}`,
        onCoverSaved,
      }
    );
    expect(result?.title).toBe('New');
    expect(result?.coverImageUrl).toBe('https://cdn/cover.jpg');
    expect(result?.coverImage).toBeUndefined();
    expect(onCoverSaved).toHaveBeenCalledWith('proj-1/custom.png');
  });

  it('resolveImportMetadataUpdate calls onCoverError when upload throws', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('upload failed'));
    const onCoverError = vi.fn();
    const result = await resolveImportMetadataUpdate(
      {},
      { coverImage: { data: Buffer.from('x'), mimeType: 'image/jpeg' } },
      'p1',
      upload,
      { onCoverError }
    );
    expect(onCoverError).toHaveBeenCalled();
    expect(result?.coverImage).toBeUndefined();
  });

  it('buildRecentChapterSnapshotEntries maps batch titles to numbers', () => {
    expect(buildRecentChapterSnapshotEntries(3, ['A', 'B'])).toEqual([
      { number: 3, title: 'A' },
      { number: 4, title: 'B' },
    ]);
  });
});
