import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockServiceFrom = vi.fn();

vi.mock('../../supabaseClient.js', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  createServiceRoleClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockServiceFrom(...args),
  })),
}));

import { getActiveAnnouncementForUser, listPublishedNewsPosts } from './news.js';

function chainable(rows: unknown[]) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
  };
  return chain;
}

describe('getActiveAnnouncementForUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no active scheduled announcements', async () => {
    mockFrom.mockReturnValue(chainable([]));

    const result = await getActiveAnnouncementForUser({ userRole: 'user' });
    assert.equal(result, null);
  });

  it('returns announcement for matching role and schedule', async () => {
    const now = new Date('2026-07-12T12:00:00Z');
    vi.setSystemTime(now);

    mockFrom.mockReturnValue(
      chainable([
        {
          id: 'a1',
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
          created_at: '',
          updated_at: '',
          news_posts: null,
        },
      ])
    );

    const result = await getActiveAnnouncementForUser({ userRole: 'user' });
    assert.ok(result);
    assert.equal(result?.message, 'Hello readers');

    vi.useRealTimers();
  });
});

describe('listPublishedNewsPosts', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no posts', async () => {
    mockFrom.mockReturnValue(chainable([]));
    const posts = await listPublishedNewsPosts({ limit: 5 });
    assert.deepEqual(posts, []);
  });
});
