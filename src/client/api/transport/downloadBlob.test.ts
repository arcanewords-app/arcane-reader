/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadBlob,
  parseContentDispositionFilename,
  triggerBrowserDownload,
} from './downloadBlob.js';

describe('parseContentDispositionFilename', () => {
  it('extracts quoted filename', () => {
    expect(
      parseContentDispositionFilename('attachment; filename="book.epub"', 'fallback.epub')
    ).toBe('book.epub');
  });

  it('returns fallback when header missing', () => {
    expect(parseContentDispositionFilename(null, 'fallback.fb2')).toBe('fallback.fb2');
  });
});

describe('triggerBrowserDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and clicks a temporary link', () => {
    const click = vi.fn();
    const appendChild = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation(() => null as never);
    const removeChild = vi
      .spyOn(document.body, 'removeChild')
      .mockImplementation(() => null as never);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue({ click } as unknown as HTMLAnchorElement);

    triggerBrowserDownload(new Blob(['x']), 'test.txt');

    expect(click).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledOnce();
    expect(removeChild).toHaveBeenCalledOnce();
  });
});

describe('downloadBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws ApiError on failed response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ error: 'Denied' }),
    } as Response);

    await expect(
      downloadBlob('/api/test', { fallbackFilename: 'x.txt', token: 't' })
    ).rejects.toMatchObject({ message: 'Denied', status: 403 });
  });

  it('downloads blob on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Disposition': 'filename="out.epub"' }),
      blob: async () => new Blob(['data']),
    } as Response);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue({
      click: vi.fn(),
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as never);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as never);

    const result = await downloadBlob('/api/test', { fallbackFilename: 'fallback.epub' });
    expect(result.filename).toBe('out.epub');
  });
});
