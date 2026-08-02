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

  it('news and announcement admin helpers hit expected endpoints', async () => {
    stubFetchJson({ id: 'n1' });
    await adminApi.createNewsPost({ title: 'T', summary: 'S' });
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, RequestInit])[0],
      '/api/admin/news'
    );

    stubFetchJson({ id: 'n1' });
    await adminApi.publishNewsPost('n1');
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, RequestInit])[0],
      '/api/admin/news/n1/publish'
    );

    stubFetchJson(undefined, 204);
    await adminApi.deleteNewsPost('n1');
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0],
      '/api/admin/news/n1'
    );

    stubFetchJson([]);
    await adminApi.getAdminAnnouncements();
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0],
      '/api/admin/announcements'
    );

    stubFetchJson({ id: 'a1' });
    await adminApi.createAnnouncement({ message: 'hi', variant: 'info' });
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0],
      '/api/admin/announcements'
    );

    stubFetchJson({ id: 'a1' });
    await adminApi.createAnnouncementFromNews('n1', { message: 'from news' });
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0],
      '/api/admin/announcements/from-news/n1'
    );

    stubFetchJson(undefined, 204);
    await adminApi.deleteAnnouncement('a1');
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0],
      '/api/admin/announcements/a1'
    );
  });

  it('admin publications/projects/translation-request helpers build queries', async () => {
    stubFetchJson([]);
    await adminApi.getAdminPublications({
      status: 'published',
      search: 'q',
      targetLanguage: 'ru',
      limit: 10,
      offset: 5,
    });
    const pubsUrl = ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0];
    assert.ok(pubsUrl.includes('/api/admin/publications?'));
    assert.ok(pubsUrl.includes('status=published'));
    assert.ok(pubsUrl.includes('targetLanguage=ru'));

    stubFetchJson({ ok: true });
    await adminApi.adminUnpublishPublication('p1');
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0],
      '/api/admin/publications/p1/unpublish'
    );

    stubFetchJson([]);
    await adminApi.getAdminProjects({
      search: 'x',
      publicationStatus: 'published',
      limit: 5,
      offset: 0,
    });
    const projectsUrl = ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0];
    assert.ok(projectsUrl.includes('publicationStatus=published'));

    stubFetchJson({ ok: true });
    await adminApi.adminDeleteProject('proj-1');
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, RequestInit])[1].method,
      'DELETE'
    );

    stubFetchJson([]);
    await adminApi.getAdminTranslationRequests({ status: 'pending', search: 's', limit: 1 });
    const trUrl = ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string])[0];
    assert.ok(trUrl.includes('/api/admin/translation-requests?'));
    assert.ok(trUrl.includes('status=pending'));

    stubFetchJson({ id: 'tr1' });
    await adminApi.updateAdminTranslationRequest('tr1', { status: 'fulfilled', adminNotes: 'ok' });
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, RequestInit])[1].method,
      'PATCH'
    );

    stubFetchJson(undefined, 204);
    await adminApi.deleteAdminTranslationRequest('tr1');
    assert.equal(
      ((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, RequestInit])[1].method,
      'DELETE'
    );

    stubFetchJson({ usageCount: 2 });
    const usage = await adminApi.getEntityUsage('e1');
    assert.deepEqual(usage, { usageCount: 2 });
  });
});
