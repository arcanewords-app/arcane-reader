import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom, mockGetUserById, mockListUsers, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUserById: vi.fn(),
  mockListUsers: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
    auth: { admin: { getUserById: mockGetUserById, listUsers: mockListUsers } },
  })),
}));

import {
  countAdminUsersWithRole,
  deleteProjectAdmin,
  listProjectsAdmin,
  listPublicationsAdmin,
  listUsersAdmin,
  unpublishProjectAdmin,
  unpublishPublicationAdmin,
  updateUserRoleAdmin,
} from './admin.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown; count?: number }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of [
    'select',
    'eq',
    'update',
    'single',
    'maybeSingle',
    'order',
    'range',
    'ilike',
    'in',
    'not',
    'or',
    'delete',
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

function publicationListRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pub-1',
    project_id: 'proj-1',
    user_id: 'user-1',
    status: 'published',
    title: 'Novel Title',
    description: null,
    cover_image_url: null,
    author_display: null,
    translator_display: null,
    source_language: 'en',
    target_language: 'ru',
    published_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    slug: 'novel',
    translated_chapter_count: 5,
    ...overrides,
  };
}

describe('listPublicationsAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped publications with chapter counts', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [publicationListRow()],
        error: null,
      })
    );

    const result = await listPublicationsAdmin();
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 'pub-1');
    assert.equal(result[0]?.translatedChapterCount, 5);
    assert.equal(mockFrom.mock.calls[0]?.[0], 'publications_list_with_counts');
  });

  it('applies status, language, and search filters', async () => {
    const chain = chainable({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listPublicationsAdmin({
      status: 'draft',
      targetLanguage: 'ru',
      search: 'fantasy',
      limit: 10,
      offset: 20,
    });

    assert.equal(
      chain.eq.mock.calls.some((c) => c[0] === 'status' && c[1] === 'draft'),
      true
    );
    assert.equal(
      chain.eq.mock.calls.some((c) => c[0] === 'target_language' && c[1] === 'ru'),
      true
    );
    assert.equal(
      chain.ilike.mock.calls.some((c) => c[0] === 'title'),
      true
    );
    assert.equal(chain.range.mock.calls[0]?.[0], 20);
    assert.equal(chain.range.mock.calls[0]?.[1], 29);
  });

  it('falls back to publications table when view relation is missing', async () => {
    const viewChain = chainable({
      data: null,
      error: { message: 'relation "publications_list_with_counts" does not exist' },
    });
    const fallbackChain = chainable({
      data: [publicationListRow({ translated_chapter_count: undefined })],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'publications_list_with_counts') return viewChain;
      if (table === 'publications') return fallbackChain;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await listPublicationsAdmin();
    assert.equal(result.length, 1);
    assert.equal(result[0]?.translatedChapterCount, 0);
  });

  it('throws when list query fails without relation error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'permission denied' },
      })
    );

    await assert.rejects(() => listPublicationsAdmin(), /Failed to list publications/);
  });
});

describe('unpublishPublicationAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when publication is unpublished', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { id: 'pub-1', slug: 'novel' },
        error: null,
      })
    );

    const ok = await unpublishPublicationAdmin('pub-1');
    assert.equal(ok, true);
  });

  it('returns false when publication is not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const ok = await unpublishPublicationAdmin('missing');
    assert.equal(ok, false);
  });

  it('throws on unexpected database error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'XX000', message: 'db down' },
      })
    );

    await assert.rejects(
      () => unpublishPublicationAdmin('pub-1'),
      /Failed to unpublish publication/
    );
  });
});

describe('listProjectsAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no projects match', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [],
        error: null,
      })
    );

    const result = await listProjectsAdmin();
    assert.deepEqual(result, []);
  });

  it('maps projects with publications, counts, and owner email', async () => {
    const projectsChain = chainable({
      data: [
        {
          id: 'proj-1',
          name: 'My Novel',
          user_id: 'user-1',
          source_language: 'en',
          target_language: 'ru',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
      error: null,
    });
    const publicationsChain = chainable({
      data: [
        {
          id: 'pub-1',
          project_id: 'proj-1',
          status: 'published',
          title: 'Published Novel',
          slug: 'novel',
        },
      ],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') return projectsChain;
      if (table === 'publications') return publicationsChain;
      throw new Error(`unexpected table ${table}`);
    });
    mockRpc.mockResolvedValue({
      data: [{ project_id: 'proj-1', total_count: 10, translated_count: 4 }],
      error: null,
    });
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'owner@example.com' } },
      error: null,
    });

    const result = await listProjectsAdmin();
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, 'My Novel');
    assert.equal(result[0]?.ownerEmail, 'owner@example.com');
    assert.equal(result[0]?.chapterCount, 10);
    assert.equal(result[0]?.translatedCount, 4);
    assert.equal(result[0]?.publicationStatus, 'published');
  });

  it('filters by published publication status', async () => {
    const pubFilterChain = chainable({
      data: [{ project_id: 'proj-1' }],
      error: null,
    });
    const projectsChain = chainable({ data: [], error: null });
    let pubCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'publications') {
        pubCalls += 1;
        return pubCalls === 1 ? pubFilterChain : chainable({ data: [], error: null });
      }
      if (table === 'projects') return projectsChain;
      throw new Error(`unexpected table ${table}`);
    });

    await listProjectsAdmin({ publicationStatus: 'published' });
    assert.equal(projectsChain.in.mock.calls.length, 1);
  });

  it('returns empty when published filter matches no projects', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [],
        error: null,
      })
    );

    const result = await listProjectsAdmin({ publicationStatus: 'published' });
    assert.deepEqual(result, []);
  });

  it('filters projects without publication', async () => {
    const pubFilterChain = chainable({
      data: [{ project_id: 'proj-with-pub' }],
      error: null,
    });
    const projectsChain = chainable({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'publications') return pubFilterChain;
      if (table === 'projects') return projectsChain;
      throw new Error(`unexpected table ${table}`);
    });

    await listProjectsAdmin({ publicationStatus: 'none' });
    assert.equal(projectsChain.not.mock.calls.length, 1);
  });

  it('searches by project name and publication title', async () => {
    const pubSearchChain = chainable({
      data: [{ project_id: 'proj-2' }],
      error: null,
    });
    const projectsChain = chainable({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'publications') return pubSearchChain;
      if (table === 'projects') return projectsChain;
      throw new Error(`unexpected table ${table}`);
    });

    await listProjectsAdmin({ search: 'dragon' });
    assert.equal(projectsChain.or.mock.calls.length, 1);
  });

  it('throws when project list query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'list failed' },
      })
    );

    await assert.rejects(() => listProjectsAdmin(), /Failed to list admin projects/);
  });
});

describe('unpublishProjectAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns publication id and slug on success', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { id: 'pub-1', slug: 'novel' },
        error: null,
      })
    );

    const result = await unpublishProjectAdmin('proj-1');
    assert.deepEqual(result, { publicationId: 'pub-1', slug: 'novel' });
  });

  it('returns null when project has no publication', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const result = await unpublishProjectAdmin('proj-1');
    assert.equal(result, null);
  });

  it('throws on unexpected error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'XX000', message: 'db error' },
      })
    );

    await assert.rejects(() => unpublishProjectAdmin('proj-1'), /Failed to unpublish project/);
  });
});

describe('deleteProjectAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns deleted false when project is missing', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const result = await deleteProjectAdmin('missing');
    assert.deepEqual(result, {
      deleted: false,
      userId: null,
      publicationId: null,
      publicationSlug: null,
    });
  });

  it('deletes project and returns metadata', async () => {
    const fetchChain = chainable({
      data: { id: 'proj-1', user_id: 'user-1' },
      error: null,
    });
    const pubChain = chainable({
      data: { id: 'pub-1', slug: 'novel' },
      error: null,
    });
    const deleteChain = chainable({ data: null, error: null });
    let calls = 0;
    mockFrom.mockImplementation((table: string) => {
      calls += 1;
      if (table === 'projects' && calls === 1) return fetchChain;
      if (table === 'publications') return pubChain;
      if (table === 'projects') return deleteChain;
      throw new Error(`unexpected table ${table} call ${calls}`);
    });

    const result = await deleteProjectAdmin('proj-1');
    assert.equal(result.deleted, true);
    assert.equal(result.userId, 'user-1');
    assert.equal(result.publicationId, 'pub-1');
    assert.equal(result.publicationSlug, 'novel');
  });

  it('throws when delete fails', async () => {
    const fetchChain = chainable({
      data: { id: 'proj-1', user_id: 'user-1' },
      error: null,
    });
    const pubChain = chainable({ data: null, error: null });
    const deleteChain = chainable({
      data: null,
      error: { message: 'delete blocked' },
    });
    let projCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'publications') return pubChain;
      if (table === 'projects') {
        projCalls += 1;
        return projCalls === 1 ? fetchChain : deleteChain;
      }
      throw new Error(`unexpected table ${table}`);
    });

    await assert.rejects(() => deleteProjectAdmin('proj-1'), /Failed to delete project/);
  });
});

describe('listUsersAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when auth list has no users', async () => {
    mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });

    const result = await listUsersAdmin();
    assert.deepEqual(result, []);
    assert.equal(mockFrom.mock.calls.length, 0);
  });

  it('maps users with profiles and filters by search', async () => {
    mockListUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'u1', email: 'admin@example.com', created_at: '2026-01-01T00:00:00Z' },
          { id: 'u2', email: 'reader@example.com', created_at: '2026-01-02T00:00:00Z' },
        ],
      },
      error: null,
    });
    mockFrom.mockReturnValue(
      chainable({
        data: [
          { id: 'u1', role: 'admin', avatar_url: null, created_at: '2026-01-01T00:00:00Z' },
          { id: 'u2', role: 'user', avatar_url: 'http://x/a.png', created_at: null },
        ],
        error: null,
      })
    );

    const result = await listUsersAdmin({ search: 'admin' });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.email, 'admin@example.com');
    assert.equal(result[0]?.role, 'admin');
  });

  it('throws when auth list fails', async () => {
    mockListUsers.mockResolvedValue({
      data: null,
      error: { message: 'auth error' },
    });

    await assert.rejects(() => listUsersAdmin(), /Failed to list users/);
  });
});

describe('countAdminUsersWithRole', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns profile count for role', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
        count: 3,
      })
    );

    const count = await countAdminUsersWithRole('admin');
    assert.equal(count, 3);
  });

  it('throws when count query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'count failed' },
      })
    );

    await assert.rejects(() => countAdminUsersWithRole('admin'), /Failed to count admins/);
  });
});

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

  it('throws when auth user lookup fails after profile update', async () => {
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
      data: null,
      error: { message: 'auth lookup failed' },
    });

    await assert.rejects(() => updateUserRoleAdmin('user-1', 'author'), /Failed to load user/);
  });
});
