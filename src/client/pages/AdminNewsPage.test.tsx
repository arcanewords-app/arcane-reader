// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewsPost } from '../types.js';

const mocks = vi.hoisted(() => ({
  getAdminNewsPosts: vi.fn(),
  getAdminAnnouncements: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  api: {
    getAdminNewsPosts: (...args: unknown[]) => mocks.getAdminNewsPosts(...args),
    getAdminAnnouncements: (...args: unknown[]) => mocks.getAdminAnnouncements(...args),
  },
}));

import { AdminNewsPage } from './AdminNewsPage.js';

function makePost(overrides: Partial<NewsPost> = {}): NewsPost {
  return {
    id: 'n1',
    slug: 'hello',
    title: 'Hello News',
    summary: 'Summary',
    body: 'Body',
    category: 'feature',
    status: 'draft',
    primaryLocale: 'en',
    translations: {},
    publishedAt: null,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('AdminNewsPage', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders intro and empty list when API returns no posts', async () => {
    mocks.getAdminNewsPosts.mockResolvedValue([]);
    mocks.getAdminAnnouncements.mockResolvedValue([]);
    render(<AdminNewsPage />);

    expect(screen.getByText('admin.news.subtitle')).toBeTruthy();
    expect(screen.getByText('admin.news.createTitle')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('admin.news.empty')).toBeTruthy();
    });
  });

  it('lists news posts from the API', async () => {
    mocks.getAdminNewsPosts.mockResolvedValue([makePost()]);
    mocks.getAdminAnnouncements.mockResolvedValue([]);
    render(<AdminNewsPage />);

    await waitFor(() => {
      expect(screen.getByText('Hello News')).toBeTruthy();
      expect(screen.getByText('admin.news.publish')).toBeTruthy();
    });
  });
});
