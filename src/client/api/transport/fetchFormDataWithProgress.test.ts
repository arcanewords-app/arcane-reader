// @vitest-environment happy-dom
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getToken: vi.fn(() => 'tok'),
  refresh: vi.fn(async () => false),
  clearStorage: vi.fn(),
}));

vi.mock('../../services/authService.js', () => ({
  authService: auth,
  isReadingRoute: () => false,
  openAuthModal: vi.fn(),
}));

vi.mock('./fetchJson.js', () => ({
  handleAuthError: vi.fn(),
  tryRefresh: (...args: unknown[]) => auth.refresh(...args),
}));

import { fetchFormDataWithProgress } from './fetchFormDataWithProgress.js';
import { handleAuthError } from './fetchJson.js';

type Handler = (ev?: unknown) => void;

class MockXHR {
  static instances: MockXHR[] = [];
  status = 200;
  responseText = '{}';
  upload = {
    addEventListener: vi.fn((event: string, cb: Handler) => {
      this.uploadHandlers[event] = cb;
    }),
  };
  handlers: Record<string, Handler> = {};
  uploadHandlers: Record<string, Handler> = {};
  headers: Record<string, string> = {};
  aborted = false;

  open = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => {
    this.aborted = true;
    this.handlers.abort?.();
  });
  setRequestHeader = vi.fn((k: string, v: string) => {
    this.headers[k] = v;
  });
  addEventListener = vi.fn((event: string, cb: Handler) => {
    this.handlers[event] = cb;
  });

  constructor() {
    MockXHR.instances.push(this);
  }
}

describe('fetchFormDataWithProgress', () => {
  beforeEach(() => {
    MockXHR.instances = [];
    auth.getToken.mockReturnValue('tok');
    auth.refresh.mockResolvedValue(false);
    vi.stubGlobal('XMLHttpRequest', MockXHR as unknown as typeof XMLHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves parsed JSON on 2xx and reports upload progress', async () => {
    const onProgress = vi.fn();
    const promise = fetchFormDataWithProgress<{ ok: boolean }>('/api/upload', new FormData(), {
      onProgress,
    });
    const xhr = MockXHR.instances[0]!;
    xhr.uploadHandlers.progress?.({ lengthComputable: true, loaded: 5, total: 10 });
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ ok: true });
    xhr.handlers.load?.();
    assert.deepEqual(await promise, { ok: true });
    assert.deepEqual(onProgress.mock.calls[0], [5, 10]);
    assert.equal(xhr.headers.Authorization, 'Bearer tok');
  });

  it('rejects on invalid JSON and network/abort errors', async () => {
    const badJson = fetchFormDataWithProgress('/api/upload', new FormData());
    const xhr1 = MockXHR.instances[0]!;
    xhr1.status = 200;
    xhr1.responseText = '{bad';
    xhr1.handlers.load?.();
    await assert.rejects(badJson, /Invalid JSON/);

    const network = fetchFormDataWithProgress('/api/upload', new FormData());
    MockXHR.instances[1]!.handlers.error?.();
    await assert.rejects(network, /Network error/);

    const aborted = fetchFormDataWithProgress('/api/upload', new FormData());
    MockXHR.instances[2]!.handlers.abort?.();
    await assert.rejects(aborted, /aborted/i);
  });

  it('handles 401 refresh success/failure and 503 degraded event', async () => {
    auth.refresh.mockResolvedValueOnce(true);
    const retryReject = fetchFormDataWithProgress('/api/upload', new FormData());
    const xhr1 = MockXHR.instances[0]!;
    xhr1.status = 401;
    xhr1.responseText = JSON.stringify({ error: 'Unauthorized' });
    xhr1.handlers.load?.();
    await assert.rejects(retryReject, /Unauthorized/);

    auth.refresh.mockResolvedValueOnce(false);
    const authFail = fetchFormDataWithProgress('/api/upload', new FormData());
    const xhr2 = MockXHR.instances[1]!;
    xhr2.status = 401;
    xhr2.responseText = JSON.stringify({ error: 'Unauthorized' });
    xhr2.handlers.load?.();
    await assert.rejects(authFail, /Unauthorized/);
    assert.equal(vi.mocked(handleAuthError).mock.calls.length, 1);

    const degraded = vi.fn();
    window.addEventListener('arcane:service-degraded', degraded);
    const s503 = fetchFormDataWithProgress('/api/upload', new FormData());
    const xhr3 = MockXHR.instances[2]!;
    xhr3.status = 503;
    xhr3.responseText = JSON.stringify({ error: 'down', service: 'supabase' });
    xhr3.handlers.load?.();
    await assert.rejects(s503, /503/);
    assert.equal(degraded.mock.calls.length, 1);
    window.removeEventListener('arcane:service-degraded', degraded);
  });

  it('rejects non-2xx with parsed API error and aborts on signal', async () => {
    const bad = fetchFormDataWithProgress('/api/upload', new FormData());
    const xhr = MockXHR.instances[0]!;
    xhr.status = 400;
    xhr.responseText = JSON.stringify({ error: 'bad request' });
    xhr.handlers.load?.();
    await assert.rejects(bad, /bad request|400/);

    const controller = new AbortController();
    const pending = fetchFormDataWithProgress('/api/upload', new FormData(), {
      signal: controller.signal,
    });
    const xhr2 = MockXHR.instances[1]!;
    controller.abort();
    assert.equal(xhr2.abort.mock.calls.length, 1);
    await assert.rejects(pending, /aborted/i);
  });
});
