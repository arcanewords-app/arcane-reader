// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicationListItem } from '../types.js';

const mocks = vi.hoisted(() => {
  const catalogUrlState = { filter: 'all' as const, entityFilter: {}, sort: null as const };
  return {
    getPublications: vi.fn(),
    catalogUrlState,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/useUserRole.js', () => ({
  useUserRole: () => ({
    user: null,
    role: 'guest',
    isGuest: true,
    isAtLeast: () => false,
    refresh: vi.fn(),
  }),
}));

vi.mock('../hooks/useUrlSync.js', () => ({
  useUrlSync: () => ({
    state: mocks.catalogUrlState,
    setState: vi.fn(),
    replaceUrl: vi.fn(),
  }),
}));

vi.mock('../hooks/useReadingHistory.js', () => ({
  useReadingHistory: () => ({ readingHistoryMap: {} }),
}));

vi.mock('../services/authService.js', () => ({
  authService: {
    getToken: () => null,
  },
  openAuthModal: vi.fn(),
}));

vi.mock('../components/Home/PublicationCard.js', () => ({
  PublicationCard: ({ publication }: { publication: { title: string | null } }) => (
    <div data-testid="publication-card">{publication.title}</div>
  ),
}));

vi.mock('../components/Home/CatalogFilterToolbar.js', () => ({
  CatalogFilterToolbar: () => <div data-testid="catalog-filter-toolbar" />,
}));

vi.mock('../components/TranslationRequests/SuggestTranslationModal.js', () => ({
  SuggestTranslationModal: () => null,
}));

vi.mock('../components/ui', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="page-loading">{text}</div>,
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Icon: () => null,
  Button: ({ children, ...props }: { children?: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Modal: () => null,
}));

vi.mock('../api/client.js', () => ({
  api: {
    getPublications: (...args: unknown[]) => mocks.getPublications(...args),
    getPublicEntityById: vi.fn().mockResolvedValue(null),
    getPublicEntitiesByIds: vi.fn().mockResolvedValue([]),
  },
}));

import { HomePage } from './HomePage.js';

function makePublication(overrides: Partial<PublicationListItem> = {}): PublicationListItem {
  return {
    id: 'pub-1',
    projectId: 'proj-1',
    status: 'published',
    title: 'Catalog Book',
    description: 'Description',
    coverImageUrl: null,
    authorDisplay: 'Author',
    translatorDisplay: null,
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    publishedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    slug: 'catalog-book',
    ...overrides,
  };
}

describe('HomePage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows loading then catalog shell with publications', async () => {
    mocks.getPublications.mockResolvedValue([makePublication()]);
    render(<HomePage />);

    expect(screen.getByTestId('page-loading')).toHaveProperty('textContent', 'home.loading');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveProperty('textContent', 'home.title');
      expect(screen.getByTestId('catalog-filter-toolbar')).toBeTruthy();
      expect(screen.getByTestId('publication-card')).toHaveProperty('textContent', 'Catalog Book');
    });
  });

  it('shows empty state when API returns no publications', async () => {
    mocks.getPublications.mockResolvedValue([]);
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('home.noPublications')).toBeTruthy();
    });
  });
});
