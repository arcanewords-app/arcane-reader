import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

vi.mock('../../services/authService.js', () => ({
  authService: {
    getToken: () => 'test-token',
    refresh: vi.fn(async () => false),
    clearStorage: vi.fn(),
  },
  isReadingRoute: () => false,
  openAuthModal: vi.fn(),
}));

import { adminApi } from './admin.js';

function stubFetchJson(data: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => (status === 204 ? '' : JSON.stringify(data)),
      json: async () => data,
    } as Response)
  );
}

describe('adminApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('getAdminUsers calls fetch with admin users endpoint', async () => {
    const users = [{ id: 'u1', email: 'a@b.com', role: 'author' }];
    stubFetchJson(users);

    const result = await adminApi.getAdminUsers();
    assert.deepEqual(result, users);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    assert.equal(url, '/api/admin/users');
  });

  it('getAdminNewsPosts builds query string from params', async () => {
    stubFetchJson([]);

    await adminApi.getAdminNewsPosts({ status: 'draft', search: 'release', limit: 20, offset: 0 });

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    assert.ok(url.startsWith('/api/admin/news?'));
    assert.ok(url.includes('status=draft'));
    assert.ok(url.includes('search=release'));
    assert.ok(url.includes('limit=20'));
    assert.ok(url.includes('offset=0'));
  });

  it('updateAdminUserRole calls fetch with PATCH body', async () => {
    const updated = { id: 'u1', email: 'a@b.com', role: 'admin' };
    stubFetchJson(updated);

    const result = await adminApi.updateAdminUserRole('u1', 'admin');
    assert.deepEqual(result, updated);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    assert.equal(url, '/api/admin/users/u1/role');
    assert.equal(init.method, 'PATCH');
    assert.equal(init.body, JSON.stringify({ role: 'admin' }));
  });

  it('createPublicEntity posts JSON body', async () => {
    const entity = { id: 'e1', kind: 'author', name: 'Alice' };
    stubFetchJson(entity);

    const result = await adminApi.createPublicEntity({
      kind: 'author',
      name: 'Alice',
      description: 'Writer',
    });
    assert.deepEqual(result, entity);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    assert.equal(url, '/api/admin/entities');
    assert.equal(init.method, 'POST');
    assert.equal(
      init.body,
      JSON.stringify({ kind: 'author', name: 'Alice', description: 'Writer' })
    );
  });

  it('deletePublicEntity calls DELETE', async () => {
    stubFetchJson(undefined, 204);

    await adminApi.deletePublicEntity('e1');
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    assert.equal(url, '/api/admin/entities/e1');
    assert.equal(init.method, 'DELETE');
  });
});
