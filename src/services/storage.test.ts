import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import {
  copyFile,
  createSignedUrl,
  deleteFile,
  deleteFiles,
  downloadFile,
  extractPathFromUrl,
  generateUniqueFilename,
  getPublicUrl,
  listFiles,
  uploadFile,
} from './storage.js';

const { mockUpload, mockGetPublicUrl, mockCreateSignedUrl, mockList, mockRemove, mockDownload } =
  vi.hoisted(() => ({
    mockUpload: vi.fn(),
    mockGetPublicUrl: vi.fn(),
    mockCreateSignedUrl: vi.fn(),
    mockList: vi.fn(),
    mockRemove: vi.fn(),
    mockDownload: vi.fn(),
  }));

vi.mock('./supabaseClient.js', () => ({
  createServiceRoleClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
        createSignedUrl: mockCreateSignedUrl,
        list: mockList,
        remove: mockRemove,
        download: mockDownload,
      })),
    },
  })),
}));

describe('storage helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uploadFile returns path and public URL on success', async () => {
    mockUpload.mockResolvedValue({ data: { path: 'proj-1/cover.jpg' }, error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/proj-1/cover.jpg' } });

    const result = await uploadFile('images', 'proj-1/cover.jpg', Buffer.from('img'), {
      contentType: 'image/jpeg',
    });

    assert.equal(result.path, 'proj-1/cover.jpg');
    assert.equal(result.publicUrl, 'https://cdn.test/proj-1/cover.jpg');
  });

  it('uploadFile throws when Supabase returns error', async () => {
    mockUpload.mockResolvedValue({ data: null, error: { message: 'quota exceeded' } });

    await assert.rejects(
      () => uploadFile('images', 'bad.jpg', Buffer.from('x')),
      /Failed to upload file to images: quota exceeded/
    );
  });

  it('createSignedUrl returns signed URL on success', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.test/file' },
      error: null,
    });

    const result = await createSignedUrl('exports', 'proj-1/book.epub', 900);
    assert.equal(result.signedUrl, 'https://signed.test/file');
  });

  it('createSignedUrl throws when signed URL is missing', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'not found' } });

    await assert.rejects(
      () => createSignedUrl('exports', 'missing.epub'),
      /Failed to create signed URL for exports/
    );
  });

  it('listFiles paginates until a short page is returned', async () => {
    mockList
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => ({ name: `file-${i}.epub` })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ name: 'file-last.epub' }],
        error: null,
      });

    const files = await listFiles('exports', 'proj-1', { limit: 100 });
    assert.equal(files.length, 101);
    assert.equal(mockList.mock.calls.length, 2);
  });

  it('deleteFiles is a no-op for empty paths', async () => {
    await deleteFiles('exports', []);
    assert.equal(mockRemove.mock.calls.length, 0);
  });

  it('deleteFile throws on storage error', async () => {
    mockRemove.mockResolvedValue({ error: { message: 'permission denied' } });

    await assert.rejects(
      () => deleteFile('avatars', 'user-1/avatar.png'),
      /Failed to delete file from avatars/
    );
  });

  it('downloadFile returns buffer from blob', async () => {
    const blob = {
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    };
    mockDownload.mockResolvedValue({ data: blob, error: null });

    const buffer = await downloadFile('exports', 'proj-1/book.epub');
    assert.deepEqual([...buffer], [1, 2, 3]);
  });

  it('getPublicUrl returns URL from storage client', () => {
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/public.png' } });
    assert.equal(getPublicUrl('images', 'public.png'), 'https://cdn.test/public.png');
  });

  it('extractPathFromUrl parses bucket path from public URL', () => {
    const url = 'https://xxx.supabase.co/storage/v1/object/public/images/project-123/image.jpg';
    assert.equal(extractPathFromUrl(url, 'images'), 'project-123/image.jpg');
    assert.equal(extractPathFromUrl('not-a-url', 'images'), null);
  });

  it('generateUniqueFilename prefixes project folder when projectId is provided', () => {
    const path = generateUniqueFilename('export', 'epub', 'proj-42');
    assert.match(path, /^proj-42\/export-\d+-\d+\.epub$/);
  });

  it('copyFile downloads source and uploads to destination', async () => {
    const blob = {
      arrayBuffer: async () => Uint8Array.from([9, 8, 7]).buffer,
    };
    mockDownload.mockResolvedValue({ data: blob, error: null });
    mockUpload.mockResolvedValue({ data: { path: 'proj-1/copy.png' }, error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/proj-1/copy.png' } });

    const result = await copyFile('images', 'proj-1/source.png', 'proj-1/copy.png');
    assert.equal(result.path, 'proj-1/copy.png');
    assert.equal(mockDownload.mock.calls.length, 1);
    assert.equal(mockUpload.mock.calls.length, 1);
  });
});
