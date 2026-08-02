// @vitest-environment happy-dom
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getToken: vi.fn(() => 'tok'),
  refresh: vi.fn(async () => false),
  clearStorage: vi.fn(),
}));

const routeHelpers = vi.hoisted(() => ({
  isReadingRoute: vi.fn(() => false),
  openAuthModal: vi.fn(),
}));

vi.mock('../../services/authService.js', () => ({
  authService: auth,
  isReadingRoute: (...args: unknown[]) => routeHelpers.isReadingRoute(...args),
  openAuthModal: (...args: unknown[]) => routeHelpers.openAuthModal(...args),
}));

import { fetchJson, handleAuthError, tryRefresh } from './fetchJson.js';

function jsonResponse(body: unknown, status = 200): Response {
  const text = status === 204 ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => body,
  } as Response;
}

describe('fetchJson', () => {
  beforeEach(() => {
    auth.getToken.mockReturnValue('tok');
    auth.refresh.mockResolvedValue(false);
    auth.clearStorage.mockClear();
    routeHelpers.isReadingRoute.mockReturnValue(false);
    routeHelpers.openAuthModal.mockClear();
    window.history.replaceState({}, '', '/projects');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success and undefined for empty/204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true })));
    assert.deepEqual(await fetchJson('/api/x'), { ok: true });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(undefined, 204)));
    assert.equal(await fetchJson('/api/x'), undefined);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '   ',
      } as Response)
    );
    assert.equal(await fetchJson('/api/x'), undefined);
  });

  it('retries once after successful token refresh on 401', async () => {
    auth.refresh.mockResolvedValueOnce(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson('/api/secure');
    assert.deepEqual(result, { ok: true });
    assert.equal(fetchMock.mock.calls.length, 2);
  });

  it('handleAuthError redirects non-reading routes and opens modal on reading', () => {
    const response = { status: 401 } as Response;
    handleAuthError({ status: 200 } as Response);

    routeHelpers.isReadingRoute.mockReturnValue(true);
    window.history.replaceState({}, '', '/p/novel/chapters/c1/reading');
    handleAuthError(response);
    assert.equal(routeHelpers.openAuthModal.mock.calls.length, 1);
    assert.equal(auth.clearStorage.mock.calls.length, 1);

    routeHelpers.isReadingRoute.mockReturnValue(false);
    auth.clearStorage.mockClear();
    window.history.replaceState({}, '', '/');
    handleAuthError(response);
    assert.ok(window.location.search.includes('login=required'));
  });

  it('throws on 503 service unavailable and generic HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () =>
          JSON.stringify({ error: 'down', code: 'SERVICE_UNAVAILABLE', service: 'supabase' }),
        json: async () => ({ error: 'down', code: 'SERVICE_UNAVAILABLE', service: 'supabase' }),
      } as Response)
    );
    await assert.rejects(() => fetchJson('/api/x'), /down|503|unavailable/i);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'bad' }),
        json: async () => ({ error: 'bad' }),
      } as Response)
    );
    await assert.rejects(() => fetchJson('/api/x'), /bad|400/);
  });

  it('tryRefresh returns authService.refresh result', async () => {
    auth.refresh.mockResolvedValueOnce(true);
    assert.equal(await tryRefresh(), true);
    auth.refresh.mockResolvedValueOnce(false);
    assert.equal(await tryRefresh(), false);
  });
});
