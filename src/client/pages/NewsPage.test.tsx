// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewsPost } from '../types.js';

const mocks = vi.hoisted(() => ({
  getNewsPosts: vi.fn(),
  t: (key: string) => key,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/useStaticPageMeta.js', () => ({
  useStaticPageMeta: vi.fn(),
}));

vi.mock('../api/client.js', () => ({
  api: {
    getNewsPosts: mocks.getNewsPosts,
  },
}));

import { NewsPage } from './NewsPage.js';

function makePost(overrides: Partial<NewsPost> = {}): NewsPost {
  return {
    id: 'n1',
    slug: 'hello',
    title: 'Hello News',
    summary: 'Summary text',
    body: '',
    category: 'feature',
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

describe('NewsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders title and empty state when API returns no posts', async () => {
    mocks.getNewsPosts.mockResolvedValue([]);
    render(<NewsPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveProperty('textContent', 'news.title');
    await waitFor(() => {
      expect(screen.getByText('news.empty')).toBeTruthy();
    });
  });

  it('renders news list when API returns posts', async () => {
    mocks.getNewsPosts.mockResolvedValue([makePost()]);
    render(<NewsPage />);

    await waitFor(() => {
      expect(screen.getByText('Hello News')).toBeTruthy();
      expect(screen.getByText('Summary text')).toBeTruthy();
    });
  });
});
