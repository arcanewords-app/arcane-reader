// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewsPost } from '../types.js';

const mocks = vi.hoisted(() => ({
  getNewsPost: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../contexts/AnnouncementContext.js', () => ({
  useAnnouncement: () => ({ alert: null, dismiss: vi.fn() }),
}));

vi.mock('../hooks/usePageMeta.js', () => ({
  usePageMeta: vi.fn(),
}));

vi.mock('../utils/analytics.js', () => ({
  trackAnnouncementDismiss: vi.fn(),
}));

vi.mock('../api/client.js', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  api: {
    getNewsPost: mocks.getNewsPost,
  },
}));

import { NewsDetailPage } from './NewsDetailPage.js';

function makePost(overrides: Partial<NewsPost> = {}): NewsPost {
  return {
    id: 'n1',
    slug: 'hello',
    title: 'Detail Title',
    summary: 'Detail summary',
    body: 'Body **markdown**',
    category: 'update',
    status: 'published',
    primaryLocale: 'ru',
    translations: {},
    publishedAt: '2026-01-01T00:00:00Z',
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('NewsDetailPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders article when post loads', async () => {
    mocks.getNewsPost.mockResolvedValue(makePost());
    render(<NewsDetailPage slugOrId="hello" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveProperty(
        'textContent',
        'Detail Title'
      );
      expect(screen.getByText('Detail summary')).toBeTruthy();
    });
  });

  it('shows not found when slug is missing', async () => {
    render(<NewsDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('news.notFound')).toBeTruthy();
    });
    expect(mocks.getNewsPost).not.toHaveBeenCalled();
  });

  it('shows not found on 404 from API', async () => {
    const { ApiError } = await import('../api/client.js');
    mocks.getNewsPost.mockRejectedValue(new ApiError('Not found', 404));
    render(<NewsDetailPage slugOrId="missing" />);

    await waitFor(() => {
      expect(screen.getByText('news.notFound')).toBeTruthy();
    });
  });
});
