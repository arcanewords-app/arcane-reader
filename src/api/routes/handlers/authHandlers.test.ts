import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const {
  mockRegister,
  mockLogin,
  mockLogout,
  mockGetSession,
  mockGetUserByToken,
  mockRefreshSession,
  mockRespondRouteError,
  mockHandleHealthCheck,
} = vi.hoisted(() => ({
  mockRegister: vi.fn(),
  mockLogin: vi.fn(),
  mockLogout: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetUserByToken: vi.fn(),
  mockRefreshSession: vi.fn(),
  mockRespondRouteError: vi.fn(),
  mockHandleHealthCheck: vi.fn(),
}));

vi.mock('../../../services/authService.js', () => ({
  authService: {
    register: (...args: unknown[]) => mockRegister(...args),
    login: (...args: unknown[]) => mockLogin(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
    getSession: (...args: unknown[]) => mockGetSession(...args),
    getUserByToken: (...args: unknown[]) => mockGetUserByToken(...args),
    refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
  },
}));

vi.mock('../../../middleware/routeDebugError.js', () => ({
  respondRouteError: (...args: unknown[]) => mockRespondRouteError(...args),
}));

vi.mock('../../routeHelpers.js', () => ({
  handleHealthCheck: (...args: unknown[]) => mockHandleHealthCheck(...args),
}));

vi.mock('../../../config.js', () => ({
  hasAIProvider: () => true,
}));

vi.mock('../../../logger.js', () => ({
  getLoggingStatus: () => ({ level: 'info' }),
}));

import {
  handleAuthMe,
  handleHealth,
  handleLogin,
  handleLogout,
  handleRefresh,
  handleRegister,
  handleStatus,
} from './authHandlers.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('authHandlers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('handleRegister returns user on success', async () => {
    mockRegister.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    const res = mockRes();
    await handleRegister(
      { body: { email: 'a@b.com', password: 'secret12' } } as never,
      res as never
    );
    assert.deepEqual(res.body, { user: { id: 'u1', email: 'a@b.c' } });
  });

  it('handleRegister returns 400 on validation failure', async () => {
    const res = mockRes();
    await handleRegister({ body: { email: 'bad' } } as never, res as never);
    assert.equal(res.statusCode, 400);
  });

  it('handleLogin returns user and session', async () => {
    mockLogin.mockResolvedValue({ id: 'u1' });
    mockGetSession.mockResolvedValue({
      access_token: 'at',
      refresh_token: 'rt',
      expires_at: 123,
    });
    const res = mockRes();
    await handleLogin({ body: { email: 'a@b.com', password: 'secret12' } } as never, res as never);
    const body = res.body as { user: { id: string }; session: { access_token: string } };
    assert.equal(body.user.id, 'u1');
    assert.equal(body.session.access_token, 'at');
  });

  it('handleLogout returns success', async () => {
    mockLogout.mockResolvedValue(undefined);
    const res = mockRes();
    await handleLogout({} as never, res as never);
    assert.deepEqual(res.body, { success: true });
  });

  it('handleAuthMe returns 401 without bearer', async () => {
    const res = mockRes();
    await handleAuthMe({ headers: {} } as never, res as never);
    assert.equal(res.statusCode, 401);
  });

  it('handleAuthMe returns user when token valid', async () => {
    mockGetUserByToken.mockResolvedValue({ id: 'u1' });
    const res = mockRes();
    await handleAuthMe({ headers: { authorization: 'Bearer tok' } } as never, res as never);
    assert.deepEqual(res.body, { user: { id: 'u1' } });
  });

  it('handleRefresh returns 401 when session null', async () => {
    mockRefreshSession.mockResolvedValue(null);
    const res = mockRes();
    await handleRefresh({ body: { refresh_token: 'rt' } } as never, res as never);
    assert.equal(res.statusCode, 401);
  });

  it('handleRefresh returns session on success', async () => {
    mockRefreshSession.mockResolvedValue({ access_token: 'new' });
    const res = mockRes();
    await handleRefresh({ body: { refresh_token: 'rt' } } as never, res as never);
    assert.deepEqual(res.body, { session: { access_token: 'new' } });
  });

  it('handleStatus returns version and config', () => {
    const res = mockRes();
    const handler = handleStatus({
      config: { openai: { apiKey: 'key', model: 'gpt' }, upload: { maxFileSizeBytes: 1 } },
      configValidation: { valid: true, errors: [] },
    } as never);
    handler({} as never, res as never);
    const body = res.body as { version: string; ready: boolean };
    assert.equal(body.version, '0.1.0');
    assert.equal(body.ready, true);
  });

  it('handleHealth delegates to handleHealthCheck', async () => {
    mockHandleHealthCheck.mockResolvedValue(undefined);
    const res = mockRes();
    await handleHealth({} as never, res as never);
    assert.equal(mockHandleHealthCheck.mock.calls.length, 1);
  });
});
