import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import type { Application } from 'express';

vi.mock('./handlers/authHandlers.js', () => ({
  handleAuthMe: vi.fn(),
  handleHealth: vi.fn(),
  handleLogin: vi.fn(),
  handleLogout: vi.fn(),
  handleRefresh: vi.fn(),
  handleRegister: vi.fn(),
  handleStatus: () => vi.fn(),
}));

import { registerAuthRoutes } from './auth.js';

describe('registerAuthRoutes', () => {
  it('registers auth and health endpoints', () => {
    const methods: string[] = [];
    const app = {
      get(path: string) {
        methods.push(`GET ${path}`);
        return app;
      },
      post(path: string) {
        methods.push(`POST ${path}`);
        return app;
      },
    } as unknown as Application;

    registerAuthRoutes(app, {} as never);

    assert.ok(methods.includes('POST /api/auth/login'));
    assert.ok(methods.includes('POST /api/auth/register'));
    assert.ok(methods.includes('GET /api/auth/me'));
    assert.ok(methods.includes('POST /api/auth/refresh'));
    assert.ok(methods.includes('GET /api/health'));
    assert.ok(methods.includes('GET /api/status'));
  });
});
