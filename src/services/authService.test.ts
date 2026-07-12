import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import { AuthServiceError } from './authErrors.js';

const {
  mockSignUp,
  mockSignInWithPassword,
  mockSignOut,
  mockGetUser,
  mockGetSession,
  mockFrom,
  mockCreateClient,
} = vi.hoisted(() => {
  const mockSignUp = vi.fn();
  const mockSignInWithPassword = vi.fn();
  const mockSignOut = vi.fn();
  const mockGetUser = vi.fn();
  const mockGetSession = vi.fn();
  const mockRefreshSession = vi.fn();
  const mockFrom = vi.fn();
  const mockCreateClient = vi.fn();

  return {
    mockSignUp,
    mockSignInWithPassword,
    mockSignOut,
    mockGetUser,
    mockGetSession,
    mockRefreshSession,
    mockFrom,
    mockCreateClient,
  };
});

vi.mock('./supabaseClient.js', () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

function profileChain(data: { role: string; avatar_url: string | null } | null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => ({ data, error: null })),
  };
  return chain;
}

describe('authService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  async function loadAuthService() {
    const { authService } = await import('./authService.js');
    return authService;
  }

  it('register returns new user with default role', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@test.com' } },
      error: null,
    });

    const authService = await loadAuthService();
    const user = await authService.register('user@test.com', 'password123');

    assert.equal(user.id, 'u-1');
    assert.equal(user.email, 'user@test.com');
    assert.equal(user.role, 'user');
    assert.equal(user.avatarUrl, null);
  });

  it('register throws AuthServiceError when signUp fails', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User exists', code: 'user_exists', status: 422 },
    });

    const authService = await loadAuthService();
    await assert.rejects(
      () => authService.register('user@test.com', 'password123'),
      (err: unknown) => {
        assert.ok(err instanceof AuthServiceError);
        assert.equal(err.operation, 'register');
        return true;
      }
    );
  });

  it('login returns user profile role and avatar', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'u-2', email: 'author@test.com' } },
      error: null,
    });
    mockFrom.mockReturnValue(
      profileChain({ role: 'author', avatar_url: 'https://cdn.test/a.png' })
    );

    const authService = await loadAuthService();
    const user = await authService.login('author@test.com', 'password123');

    assert.equal(user.role, 'author');
    assert.equal(user.avatarUrl, 'https://cdn.test/a.png');
  });

  it('login maps guest role to user', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'u-3', email: 'guest@test.com' } },
      error: null,
    });
    mockFrom.mockReturnValue(profileChain({ role: 'guest', avatar_url: null }));

    const authService = await loadAuthService();
    const user = await authService.login('guest@test.com', 'password123');
    assert.equal(user.role, 'user');
  });

  it('logout throws AuthServiceError on signOut failure', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'network error' } });

    const authService = await loadAuthService();
    await assert.rejects(
      () => authService.logout(),
      (err: unknown) => err instanceof AuthServiceError && err.operation === 'logout'
    );
  });

  it('getCurrentUser returns null when auth.getUser fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });

    const authService = await loadAuthService();
    assert.equal(await authService.getCurrentUser(), null);
  });

  it('getUserByToken returns user from token-scoped client', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');

    const tokenClient = {
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'u-4', email: 'tok@test.com' } }, error: null }),
      },
      from: vi.fn().mockReturnValue(profileChain({ role: 'admin', avatar_url: null })),
    };
    mockCreateClient.mockReturnValue(tokenClient);

    const authService = await loadAuthService();
    const user = await authService.getUserByToken('jwt-token');

    assert.equal(user?.id, 'u-4');
    assert.equal(user?.role, 'admin');
    assert.equal(
      mockCreateClient.mock.calls[0]?.[2]?.global?.headers?.Authorization,
      'Bearer jwt-token'
    );
  });

  it('getUserByToken returns null when token is invalid', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');

    mockCreateClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } }),
      },
      from: vi.fn(),
    });

    const authService = await loadAuthService();
    assert.equal(await authService.getUserByToken('bad-token'), null);
  });

  it('refreshSession returns tokens on success', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');

    mockCreateClient.mockReturnValue({
      auth: {
        refreshSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'access',
              refresh_token: 'refresh',
              expires_at: 123456,
            },
          },
          error: null,
        }),
      },
    });

    const authService = await loadAuthService();
    const session = await authService.refreshSession('refresh-token');
    assert.deepEqual(session, {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: 123456,
    });
  });

  it('refreshSession returns null on error', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');

    mockCreateClient.mockReturnValue({
      auth: {
        refreshSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: { message: 'expired' },
        }),
      },
    });

    const authService = await loadAuthService();
    assert.equal(await authService.refreshSession('old-refresh'), null);
  });

  it('getSession throws AuthServiceError when Supabase returns error', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: { message: 'db down' } });

    const authService = await loadAuthService();
    await assert.rejects(
      () => authService.getSession(),
      (err: unknown) => err instanceof AuthServiceError && err.operation === 'session'
    );
  });
});
