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
  REFRESH_URL: '/api/auth/refresh',
  handleAuthError: vi.fn(),
  tryRefresh: (...args: unknown[]) => auth.refresh(...args),
}));

import { fetchFormData } from './fetchFormData.js';
import { handleAuthError } from './fetchJson.js';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('fetchFormData', () => {
  beforeEach(() => {
    auth.getToken.mockReturnValue('tok');
    auth.refresh.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts form data and returns JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ id: '1' })));
    const form = new FormData();
    form.append('a', 'b');
    const result = await fetchFormData<{ id: string }>('/api/x', form);
    assert.deepEqual(result, { id: '1' });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    assert.equal(init.method, 'POST');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer tok');
  });

  it('throws after successful refresh on 401 without retrying body', async () => {
    auth.refresh.mockResolvedValueOnce(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ error: 'Unauthorized' }, 401)));
    await assert.rejects(() => fetchFormData('/api/x', new FormData()), /Unauthorized/);
  });

  it('calls handleAuthError when refresh fails', async () => {
    auth.refresh.mockResolvedValueOnce(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ error: 'Unauthorized' }, 401)));
    await assert.rejects(() => fetchFormData('/api/x', new FormData()), /Unauthorized/);
    assert.equal(vi.mocked(handleAuthError).mock.calls.length, 1);
  });

  it('dispatches degraded event on 503 and rejects other errors', async () => {
    const degraded = vi.fn();
    window.addEventListener('arcane:service-degraded', degraded);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          mockResponse({ error: 'down', code: 'SERVICE_UNAVAILABLE', service: 'supabase' }, 503)
        )
    );
    await assert.rejects(() => fetchFormData('/api/x', new FormData()), /down|503/);
    assert.equal(degraded.mock.calls.length, 1);
    window.removeEventListener('arcane:service-degraded', degraded);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ error: 'bad' }, 400)));
    await assert.rejects(() => fetchFormData('/api/x', new FormData()), /bad|400/);
  });
});
