import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom, mockServiceFrom, mockValidateToken, mockCreateClientWithToken, mockTokenFrom } =
  vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockServiceFrom: vi.fn(),
    mockValidateToken: vi.fn(),
    mockCreateClientWithToken: vi.fn(),
    mockTokenFrom: vi.fn(),
  }));

vi.mock('../../supabaseClient.js', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  createServiceRoleClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockServiceFrom(...args),
  })),
  createClientWithToken: (...args: unknown[]) => mockCreateClientWithToken(...args),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: (...args: unknown[]) => mockValidateToken(...args),
}));

import {
  createAnnouncementAlert,
  createAnnouncementFromNews,
  createNewsPost,
  deleteAnnouncementAlert,
  deleteNewsPost,
  dismissAnnouncement,
  getActiveAnnouncementForUser,
  getNewsPostByIdAdmin,
  getPublishedNewsPostByIdOrSlug,
  listAnnouncementAlertsAdmin,
  listNewsPostsAdmin,
  listPublishedNewsPosts,
  publishNewsPost,
  updateAnnouncementAlert,
  updateNewsPost,
} from './news.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown; count?: number }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of [
    'select',
    'eq',
    'order',
    'range',
    'maybeSingle',
    'single',
    'insert',
    'update',
    'delete',
    'or',
    'upsert',
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

function newsPostRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'test-post',
    title: 'Test Post',
    summary: 'Summary text',
    body: 'Body text',
    category: 'other',
    status: 'draft',
    primary_locale: 'ru',
    translations: {},
    published_at: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function announcementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    news_post_id: null,
    message: 'Hello readers',
    cta_label: null,
    cta_url: null,
    variant: 'info',
    min_role: 'user',
    starts_at: '2026-07-01T00:00:00Z',
    ends_at: null,
    is_active: true,
    priority: 1,
    content_version: 1,
    dismissible: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('getPublishedNewsPostByIdOrSlug', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('queries by uuid when idOrSlug is a uuid', async () => {
    const chain = chainable({ data: newsPostRow({ status: 'published' }), error: null });
    mockFrom.mockReturnValue(chain);

    const post = await getPublishedNewsPostByIdOrSlug('11111111-1111-1111-1111-111111111111');
    assert.equal(post?.id, '11111111-1111-1111-1111-111111111111');
    assert.equal(
      chain.eq.mock.calls.some((c) => c[0] === 'id'),
      true
    );
  });

  it('queries by slug when idOrSlug is not a uuid', async () => {
    const chain = chainable({ data: newsPostRow({ status: 'published' }), error: null });
    mockFrom.mockReturnValue(chain);

    const post = await getPublishedNewsPostByIdOrSlug('test-post');
    assert.equal(post?.slug, 'test-post');
    assert.equal(
      chain.eq.mock.calls.some((c) => c[0] === 'slug' && c[1] === 'test-post'),
      true
    );
  });

  it('returns null when post is not found', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }));
    const post = await getPublishedNewsPostByIdOrSlug('missing');
    assert.equal(post, null);
  });

  it('throws when query fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'db error' } }));
    await assert.rejects(
      () => getPublishedNewsPostByIdOrSlug('test-post'),
      /Failed to get news post/
    );
  });
});

describe('listNewsPostsAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped admin posts', async () => {
    mockServiceFrom.mockReturnValue(chainable({ data: [newsPostRow()], error: null }));

    const posts = await listNewsPostsAdmin();
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.title, 'Test Post');
  });

  it('applies status and search filters', async () => {
    const chain = chainable({ data: [], error: null });
    mockServiceFrom.mockReturnValue(chain);

    await listNewsPostsAdmin({ status: 'published', search: 'release' });
    assert.equal(
      chain.eq.mock.calls.some((c) => c[0] === 'status'),
      true
    );
    assert.equal(chain.or.mock.calls.length, 1);
  });

  it('throws on list error', async () => {
    mockServiceFrom.mockReturnValue(chainable({ data: null, error: { message: 'list failed' } }));
    await assert.rejects(() => listNewsPostsAdmin(), /Failed to list admin news posts/);
  });
});

describe('getNewsPostByIdAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns post when found', async () => {
    mockServiceFrom.mockReturnValue(chainable({ data: newsPostRow(), error: null }));
    const post = await getNewsPostByIdAdmin('11111111-1111-1111-1111-111111111111');
    assert.equal(post?.title, 'Test Post');
  });

  it('returns null when not found', async () => {
    mockServiceFrom.mockReturnValue(chainable({ data: null, error: null }));
    const post = await getNewsPostByIdAdmin('missing');
    assert.equal(post, null);
  });
});

describe('createNewsPost', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates draft post with trimmed fields', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({ data: newsPostRow({ title: 'New Title' }), error: null })
    );

    const post = await createNewsPost(
      { title: '  New Title  ', summary: '  Summary  ', body: 'Body' },
      'token'
    );

    assert.equal(mockValidateToken.mock.calls.length, 1);
    assert.equal(post.title, 'New Title');
  });

  it('throws when insert fails', async () => {
    mockServiceFrom.mockReturnValue(chainable({ data: null, error: { message: 'insert failed' } }));

    await assert.rejects(
      () => createNewsPost({ title: 'T', summary: 'S' }, 'token'),
      /Failed to create news post/
    );
  });
});

describe('updateNewsPost', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates and returns post', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({ data: newsPostRow({ title: 'Updated' }), error: null })
    );

    const post = await updateNewsPost('11111111-1111-1111-1111-111111111111', {
      title: 'Updated',
    });
    assert.equal(post.title, 'Updated');
  });

  it('throws when post not found', async () => {
    mockServiceFrom.mockReturnValue(chainable({ data: null, error: null }));
    await assert.rejects(() => updateNewsPost('missing', { title: 'X' }), /not found/);
  });
});

describe('publishNewsPost', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('publishes draft post successfully', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: newsPostRow({ status: 'published', published_at: '2026-07-12T00:00:00Z' }),
        error: null,
      })
    );

    const post = await publishNewsPost('11111111-1111-1111-1111-111111111111');
    assert.equal(post.status, 'published');
  });

  it('throws when post is not a draft', async () => {
    const publishChain = chainable({ data: null, error: null });
    const fetchChain = chainable({
      data: newsPostRow({ status: 'published' }),
      error: null,
    });
    let calls = 0;
    mockServiceFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? publishChain : fetchChain;
    });

    await assert.rejects(
      () => publishNewsPost('11111111-1111-1111-1111-111111111111'),
      /not a draft/
    );
  });

  it('throws when post does not exist', async () => {
    const publishChain = chainable({ data: null, error: null });
    const fetchChain = chainable({ data: null, error: null });
    let calls = 0;
    mockServiceFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? publishChain : fetchChain;
    });

    await assert.rejects(() => publishNewsPost('missing'), /News post not found/);
  });
});

describe('deleteNewsPost', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when active alerts block deletion', async () => {
    mockServiceFrom.mockReturnValue(chainable({ data: null, error: null, count: 2 }));

    await assert.rejects(() => deleteNewsPost('news-1'), /active announcement alerts/);
  });

  it('deletes post when no active alerts', async () => {
    const countChain = chainable({ data: null, error: null, count: 0 });
    const deleteChain = chainable({ data: null, error: null });
    let calls = 0;
    mockServiceFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? countChain : deleteChain;
    });

    await deleteNewsPost('news-1');
    assert.equal(deleteChain.delete.mock.calls.length, 1);
  });
});

describe('listAnnouncementAlertsAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped alerts', async () => {
    mockServiceFrom.mockReturnValue(chainable({ data: [announcementRow()], error: null }));

    const alerts = await listAnnouncementAlertsAdmin();
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]?.message, 'Hello readers');
  });
});

describe('createAnnouncementAlert', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates standalone alert without news post', async () => {
    mockServiceFrom.mockReturnValue(chainable({ data: announcementRow(), error: null }));

    const alert = await createAnnouncementAlert({ message: 'Hello readers' });
    assert.equal(alert.message, 'Hello readers');
  });

  it('throws when linked news post is unpublished', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({ data: newsPostRow({ status: 'draft' }), error: null })
    );

    await assert.rejects(
      () => createAnnouncementAlert({ newsPostId: '11111111-1111-1111-1111-111111111111' }),
      /unpublished news post/
    );
  });
});

describe('createAnnouncementFromNews', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates alert from published news with default cta url', async () => {
    const publishedPost = newsPostRow({ status: 'published', slug: 'release-notes' });
    const fetchChain = chainable({ data: publishedPost, error: null });
    const insertChain = chainable({
      data: announcementRow({
        news_post_id: '11111111-1111-1111-1111-111111111111',
        cta_url: '/news/release-notes',
      }),
      error: null,
    });
    let calls = 0;
    mockServiceFrom.mockImplementation(() => {
      calls += 1;
      if (calls <= 2) return fetchChain;
      return insertChain;
    });

    const alert = await createAnnouncementFromNews('11111111-1111-1111-1111-111111111111', {});
    assert.equal(alert.ctaUrl, '/news/release-notes');
  });
});

describe('updateAnnouncementAlert', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates alert fields', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({ data: announcementRow({ message: 'Updated' }), error: null })
    );

    const alert = await updateAnnouncementAlert('alert-1', { message: 'Updated' });
    assert.equal(alert.message, 'Updated');
  });

  it('throws when alert not found', async () => {
    mockServiceFrom.mockReturnValue(chainable({ data: null, error: null }));
    await assert.rejects(
      () => updateAnnouncementAlert('missing', { message: 'X' }),
      /Announcement alert not found/
    );
  });
});

describe('deleteAnnouncementAlert', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deletes alert', async () => {
    const chain = chainable({ data: null, error: null });
    mockServiceFrom.mockReturnValue(chain);

    await deleteAnnouncementAlert('alert-1');
    assert.equal(chain.delete.mock.calls.length, 1);
  });
});

describe('getActiveAnnouncementForUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns null when no active scheduled announcements', async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null }));

    const result = await getActiveAnnouncementForUser({ userRole: 'user' });
    assert.equal(result, null);
  });

  it('returns announcement for matching role and schedule', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    vi.setSystemTime(now);

    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            ...announcementRow(),
            news_posts: null,
          },
        ],
        error: null,
      })
    );

    const result = await getActiveAnnouncementForUser({ userRole: 'user' });
    assert.ok(result);
    assert.equal(result?.message, 'Hello readers');
  });

  it('skips announcements dismissed at current content version', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    vi.setSystemTime(now);

    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            ...announcementRow({ id: 'alert-1', content_version: 2 }),
            news_posts: null,
          },
        ],
        error: null,
      })
    );
    mockServiceFrom.mockReturnValue(
      chainable({
        data: [{ announcement_id: 'alert-1', content_version: 2 }],
        error: null,
      })
    );

    const result = await getActiveAnnouncementForUser({
      userRole: 'user',
      userId: 'user-1',
    });
    assert.equal(result, null);
  });

  it('skips announcements below user role', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    vi.setSystemTime(now);

    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            ...announcementRow({ min_role: 'admin' }),
            news_posts: null,
          },
        ],
        error: null,
      })
    );

    const result = await getActiveAnnouncementForUser({ userRole: 'user' });
    assert.equal(result, null);
  });

  it('throws when dismissal query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ ...announcementRow(), news_posts: null }],
        error: null,
      })
    );
    mockServiceFrom.mockReturnValue(
      chainable({ data: null, error: { message: 'dismissal error' } })
    );

    await assert.rejects(
      () => getActiveAnnouncementForUser({ userRole: 'user', userId: 'user-1' }),
      /Failed to get dismissals/
    );
  });
});

describe('dismissAnnouncement', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('upserts dismissal for authenticated user', async () => {
    const chain = chainable({ data: null, error: null });
    mockCreateClientWithToken.mockReturnValue({ from: mockTokenFrom });
    mockTokenFrom.mockReturnValue(chain);

    await dismissAnnouncement('user-1', 'alert-1', 1, 'token');
    assert.equal(mockValidateToken.mock.calls.length, 1);
    assert.equal(chain.upsert.mock.calls.length, 1);
  });
});

describe('listPublishedNewsPosts', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no posts', async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null }));
    const posts = await listPublishedNewsPosts({ limit: 5 });
    assert.deepEqual(posts, []);
  });
});
