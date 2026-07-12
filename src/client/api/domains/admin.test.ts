import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFetchJson } = vi.hoisted(() => ({
  mockFetchJson: vi.fn(),
}));

vi.mock('../transport/fetchJson.js', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

import { adminApi } from './admin.js';

describe('adminApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getAdminUsers calls fetchJson with admin users endpoint', async () => {
    const users = [{ id: 'u1', email: 'a@b.com', role: 'author' }];
    mockFetchJson.mockResolvedValue(users);

    const result = await adminApi.getAdminUsers();
    assert.deepEqual(result, users);
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/admin/users');
  });

  it('getAdminNewsPosts builds query string from params', async () => {
    mockFetchJson.mockResolvedValue([]);

    await adminApi.getAdminNewsPosts({ status: 'draft', search: 'release', limit: 20, offset: 0 });

    const url = mockFetchJson.mock.calls[0]?.[0] as string;
    assert.ok(url.startsWith('/api/admin/news?'));
    assert.ok(url.includes('status=draft'));
    assert.ok(url.includes('search=release'));
    assert.ok(url.includes('limit=20'));
    assert.ok(url.includes('offset=0'));
  });

  it('updateAdminUserRole calls fetchJson with PATCH body', async () => {
    const updated = { id: 'u1', email: 'a@b.com', role: 'admin' };
    mockFetchJson.mockResolvedValue(updated);

    const result = await adminApi.updateAdminUserRole('u1', 'admin');
    assert.deepEqual(result, updated);
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/admin/users/u1/role');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.method, 'PATCH');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.body, JSON.stringify({ role: 'admin' }));
  });
});
