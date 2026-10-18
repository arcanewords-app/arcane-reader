/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadToSignedUrl } from './uploadToSignedUrl.js';

type Handler = (event?: unknown) => void;

class MockXHR {
  static instances: MockXHR[] = [];
  status = 200;
  responseText = '{}';
  handlers: Record<string, Handler> = {};
  uploadHandlers: Record<string, Handler> = {};
  method = '';
  url = '';
  body: FormData | null = null;
  upload = {
    addEventListener: vi.fn((event: string, cb: Handler) => {
      this.uploadHandlers[event] = cb;
    }),
  };

  open = vi.fn((method: string, url: string) => {
    this.method = method;
    this.url = url;
  });
  send = vi.fn((body: FormData) => {
    this.body = body;
  });
  abort = vi.fn(() => {
    this.handlers.abort?.();
  });
  addEventListener = vi.fn((event: string, cb: Handler) => {
    this.handlers[event] = cb;
  });

  constructor() {
    MockXHR.instances.push(this);
  }
}

describe('uploadToSignedUrl', () => {
  beforeEach(() => {
    MockXHR.instances = [];
    vi.stubGlobal('XMLHttpRequest', MockXHR as unknown as typeof XMLHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves on 2xx and reports computable progress', async () => {
    const onProgress = vi.fn();
    const file = new File(['bytes'], 'chapter.txt');
    const promise = uploadToSignedUrl('https://storage.example/upload', file, { onProgress });
    const xhr = MockXHR.instances[0]!;

    xhr.uploadHandlers.progress?.({ lengthComputable: false, loaded: 1, total: 2 });
    xhr.uploadHandlers.progress?.({ lengthComputable: true, loaded: 4, total: 4 });
    xhr.status = 201;
    xhr.handlers.load?.();

    await expect(promise).resolves.toBeUndefined();
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(4, 4);
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('https://storage.example/upload');
    expect(xhr.body?.get('cacheControl')).toBe('3600');
  });

  it('rejects HTTP errors, network errors, and aborts', async () => {
    const http = uploadToSignedUrl('https://storage.example/upload', new File(['x'], 'a.txt'));
    const xhr1 = MockXHR.instances[0]!;
    xhr1.status = 400;
    xhr1.responseText = JSON.stringify({ error: 'Denied' });
    xhr1.handlers.load?.();
    await expect(http).rejects.toMatchObject({ message: 'Denied', status: 400 });

    const network = uploadToSignedUrl('https://storage.example/upload', new File(['x'], 'a.txt'));
    MockXHR.instances[1]!.handlers.error?.();
    await expect(network).rejects.toMatchObject({ message: 'Network error', status: 0 });

    const aborted = uploadToSignedUrl('https://storage.example/upload', new File(['x'], 'a.txt'));
    MockXHR.instances[2]!.handlers.abort?.();
    await expect(aborted).rejects.toMatchObject({ message: 'Request aborted', status: 0 });
  });

  it('aborts the upload when the caller signal aborts', async () => {
    const controller = new AbortController();
    const promise = uploadToSignedUrl('https://storage.example/upload', new File(['x'], 'a.txt'), {
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ message: 'Request aborted' });
    expect(MockXHR.instances[0]!.abort).toHaveBeenCalled();
  });
});
