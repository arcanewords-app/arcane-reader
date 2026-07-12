import { describe, expect, it, vi } from 'vitest';
import {
  appendChapterCountWarning,
  appendRecentChapterSnapshot,
  applyCoverImageToMetadata,
  buildMultiChapterImportResponse,
  flushImportBatch,
  importMetadataChanged,
  mergeImportMetadata,
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
});
