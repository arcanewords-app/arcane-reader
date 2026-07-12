/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import {
  AUTH_CHANGED_EVENT,
  authService,
  consumePostAuthRedirect,
  isReadingRoute,
  openAuthModal,
  OPEN_AUTH_EVENT,
  POST_AUTH_REDIRECT_KEY,
} from './authService.js';

function mockFetchResponse(
  status: number,
  body: unknown,
  ok = status >= 200 && status < 300
): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('authService helpers', () => {
  it('isReadingRoute matches reading paths', () => {
    assert.equal(isReadingRoute('/p/abc/chapters/ch-1/reading'), true);
    assert.equal(isReadingRoute('/projects/1/reading'), true);
    assert.equal(isReadingRoute('/projects/1'), false);
  });

  it('openAuthModal stores redirect and dispatches event', () => {
    const handler = vi.fn();
    window.addEventListener(OPEN_AUTH_EVENT, handler);
    openAuthModal({ mode: 'login', redirect: '/projects' });
    assert.equal(sessionStorage.getItem(POST_AUTH_REDIRECT_KEY), '/projects');
    assert.equal(handler.mock.calls.length, 1);
    window.removeEventListener(OPEN_AUTH_EVENT, handler);
  });

  it('consumePostAuthRedirect returns and clears stored redirect', () => {
    sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, '/cabinet');
    assert.equal(consumePostAuthRedirect(), '/cabinet');
    assert.equal(sessionStorage.getItem(POST_AUTH_REDIRECT_KEY), null);
    assert.equal(consumePostAuthRedirect(), null);
  });
});

describe('authService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    authService.stopSessionKeeper();
    vi.restoreAllMocks();
  });

  it('register returns user on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse(200, { user: { id: 'u-1', email: 'a@test.com', role: 'user' } })
    );
    const user = await authService.register('a@test.com', 'password123');
    assert.equal(user.id, 'u-1');
    assert.equal(user.email, 'a@test.com');
  });

  it('register throws with API error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse(422, { error: 'Email taken' }, false)
    );
    await assert.rejects(() => authService.register('a@test.com', 'password123'), /Email taken/);
  });

  it('register throws default message when body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('bad json');
      },
    } as Response);
    await assert.rejects(
      () => authService.register('a@test.com', 'password123'),
      /Registration failed/
    );
  });

  it('login stores session and dispatches auth changed', async () => {
    const handler = vi.fn();
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse(200, {
        user: { id: 'u-2', email: 'b@test.com', role: 'author' },
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_at: 999999,
        },
      })
    );

    const result = await authService.login('b@test.com', 'password123');
    assert.equal(result.user.role, 'author');
    assert.equal(localStorage.getItem('arcane_auth_token'), 'access');
    assert.equal(localStorage.getItem('arcane_auth_refresh'), 'refresh');
    assert.equal(handler.mock.calls.length, 1);
    window.removeEventListener(AUTH_CHANGED_EVENT, handler);
  });

  it('login without session dispatches unauthenticated', async () => {
    const handler = vi.fn();
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse(200, {
        user: { id: 'u-3', email: 'c@test.com', role: 'user' },
        session: null,
      })
    );
    await authService.login('c@test.com', 'password123');
    assert.equal(handler.mock.calls[0]?.[0]?.detail?.authenticated, false);
    window.removeEventListener(AUTH_CHANGED_EVENT, handler);
  });

  it('refresh returns false without refresh token', async () => {
    assert.equal(await authService.refresh(), false);
  });

  it('refresh updates tokens on success', async () => {
    localStorage.setItem('arcane_auth_refresh', 'old-refresh');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse(200, {
        session: {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_at: 123456,
        },
      })
    );
    assert.equal(await authService.refresh({ silent: true }), true);
    assert.equal(localStorage.getItem('arcane_auth_token'), 'new-access');
  });

  it('refresh returns false on HTTP error', async () => {
    localStorage.setItem('arcane_auth_refresh', 'old-refresh');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(401, {}, false));
    assert.equal(await authService.refresh(), false);
  });

  it('shouldRefreshSoon is false without expires_at', () => {
    assert.equal(authService.shouldRefreshSoon(), false);
  });

  it('shouldRefreshSoon is true when expiry is near', () => {
    const soon = Math.floor(Date.now() / 1000) + 60;
    localStorage.setItem('arcane_auth_expires', String(soon));
    assert.equal(authService.shouldRefreshSoon(), true);
  });

  it('ensureFreshSession returns false when not authenticated', async () => {
    assert.equal(await authService.ensureFreshSession(), false);
  });

  it('getCachedUser returns null for invalid JSON', () => {
    localStorage.setItem('arcane_user', '{bad json');
    assert.equal(authService.getCachedUser(), null);
  });

  it('getCurrentUser returns cached user without fetch', async () => {
    const cached = { id: 'u-4', email: 'd@test.com', role: 'user' as const };
    localStorage.setItem('arcane_user', JSON.stringify(cached));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    assert.deepEqual(await authService.getCurrentUser(), cached);
    assert.equal(fetchSpy.mock.calls.length, 0);
  });

  it('getCurrentUser fetches from API and caches user', async () => {
    localStorage.setItem('arcane_auth_token', 'token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse(200, { user: { id: 'u-5', email: 'e@test.com', role: 'admin' } })
    );
    const user = await authService.getCurrentUser();
    assert.equal(user?.role, 'admin');
    assert.equal(JSON.parse(localStorage.getItem('arcane_user') ?? 'null')?.id, 'u-5');
  });

  it('getCurrentUser retries after refresh on 401', async () => {
    localStorage.setItem('arcane_auth_token', 'expired');
    localStorage.setItem('arcane_auth_refresh', 'refresh');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse(401, {}, false))
      .mockResolvedValueOnce(
        mockFetchResponse(200, {
          session: { access_token: 'new-token', refresh_token: 'refresh', expires_at: 999 },
        })
      )
      .mockResolvedValueOnce(
        mockFetchResponse(200, { user: { id: 'u-6', email: 'f@test.com', role: 'user' } })
      );

    const user = await authService.getCurrentUser();
    assert.equal(user?.id, 'u-6');
    assert.equal(fetchMock.mock.calls.length, 3);
  });

  it('getCurrentUser clears storage when token invalid', async () => {
    localStorage.setItem('arcane_auth_token', 'bad');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(403, {}, false));
    assert.equal(await authService.getCurrentUser(), null);
    assert.equal(localStorage.getItem('arcane_auth_token'), null);
  });

  it('logout clears storage even when API fails', async () => {
    localStorage.setItem('arcane_auth_token', 'token');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    await authService.logout();
    assert.equal(localStorage.getItem('arcane_auth_token'), null);
  });

  it('updateUserCache merges and dispatches events', () => {
    localStorage.setItem(
      'arcane_user',
      JSON.stringify({ id: 'u-7', email: 'g@test.com', role: 'user' })
    );
    const userHandler = vi.fn();
    window.addEventListener('arcane:user-updated', userHandler);
    authService.updateUserCache({ avatarUrl: 'https://cdn.test/a.png' });
    const cached = authService.getCachedUser();
    assert.equal(cached?.avatarUrl, 'https://cdn.test/a.png');
    assert.equal(userHandler.mock.calls.length, 1);
    window.removeEventListener('arcane:user-updated', userHandler);
  });

  it('updateUserCache is no-op without cached user', () => {
    authService.updateUserCache({ avatarUrl: 'x' });
    assert.equal(localStorage.getItem('arcane_user'), null);
  });

  it('clearStorage removes tokens and dispatches auth changed', () => {
    localStorage.setItem('arcane_auth_token', 'token');
    const handler = vi.fn();
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    authService.clearStorage();
    assert.equal(localStorage.getItem('arcane_auth_token'), null);
    assert.equal(handler.mock.calls[0]?.[0]?.detail?.authenticated, false);
    window.removeEventListener(AUTH_CHANGED_EVENT, handler);
  });
});
