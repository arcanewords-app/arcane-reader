// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminPublicationListItem } from '../types.js';

const mocks = vi.hoisted(() => ({
  getAdminPublications: vi.fn(),
  adminUnpublishPublication: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
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
    getAdminPublications: mocks.getAdminPublications,
    adminUnpublishPublication: mocks.adminUnpublishPublication,
  },
}));

import { AdminPublicationsPage } from './AdminPublicationsPage.js';

function makePublication(
  overrides: Partial<AdminPublicationListItem> = {}
): AdminPublicationListItem {
  return {
    id: 'pub1',
    projectId: 'p1',
    userId: 'u1',
    status: 'published',
    title: 'My Book',
    description: null,
    coverImageUrl: null,
    authorDisplay: 'Author Name',
    translatorDisplay: null,
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    publishedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    slug: 'my-book',
    translatedChapterCount: 5,
    ...overrides,
  };
}

describe('AdminPublicationsPage', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders page title section and publication list from API', async () => {
    mocks.getAdminPublications.mockResolvedValue([makePublication()]);
    render(<AdminPublicationsPage />);

    expect(screen.getByText('admin.publications.subtitle')).toBeTruthy();
    expect(screen.getByText('admin.publications.listTitle')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('My Book')).toBeTruthy();
      expect(screen.getByText('admin.publications.open')).toBeTruthy();
    });
  });

  it('shows empty state when API returns no publications', async () => {
    mocks.getAdminPublications.mockResolvedValue([]);
    render(<AdminPublicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('admin.publications.empty')).toBeTruthy();
    });
  });
});
