import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom, mockGetUserById } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUserById: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: mockFrom,
    auth: { admin: { getUserById: mockGetUserById } },
  })),
}));

import { updateUserRoleAdmin } from './admin.js';

function chainable(result: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'update', 'single']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

describe('updateUserRoleAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates profile role and returns admin list item', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          id: 'user-1',
          role: 'author',
          avatar_url: null,
          created_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      })
    );
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'user@example.com', created_at: '2026-01-01T00:00:00Z' } },
      error: null,
    });

    const result = await updateUserRoleAdmin('user-1', 'author');
    assert.equal(result?.role, 'author');
    assert.equal(result?.email, 'user@example.com');
  });

  it('returns null when profile missing', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const result = await updateUserRoleAdmin('missing', 'author');
    assert.equal(result, null);
  });
});
