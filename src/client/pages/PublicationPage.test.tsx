// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicationWithChapters } from '../types.js';

const mocks = vi.hoisted(() => ({
  getPublicationWithChapters: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/usePageMeta.js', () => ({
  usePageMeta: vi.fn(),
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
  useUrlSyncListeners: vi.fn(),
}));

vi.mock('../services/authService.js', () => ({
  AUTH_CHANGED_EVENT: 'arcane:auth-changed',
  authService: {
    getCurrentUser: vi.fn().mockResolvedValue(null),
  },
  openAuthModal: vi.fn(),
}));

vi.mock('../utils/analytics.js', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../api/cache/invalidation.js', () => ({
  subscribeToUserCacheInvalidation: () => () => {},
}));

vi.mock('../components/Dashboard/BookPlaceholder.js', () => ({
  BookPlaceholder: () => <div data-testid="book-placeholder" />,
}));

vi.mock('../components/Home/PublicationStatusBadge.js', () => ({
  PublicationStatusBadge: () => null,
}));

vi.mock('../components/Home/PublicationRatingCoverBadge.js', () => ({
  PublicationRatingCoverBadge: () => null,
}));

vi.mock('../components/EntityCard', () => ({
  EntityCard: () => null,
  TagChip: () => null,
}));

vi.mock('../components/Glossary', () => ({
  PublicationGlossaryModal: () => null,
}));

vi.mock('../components/ChapterTocModal.js', () => ({
  ChapterTocModal: () => null,
}));

vi.mock('../components/Publication/PublicationRatingSummary.js', () => ({
  PublicationRatingSummary: () => <div data-testid="rating-summary" />,
}));

vi.mock('../components/Publication/RatePublicationModal.js', () => ({
  RatePublicationModal: () => null,
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
    getPublicationWithChapters: (...args: unknown[]) => mocks.getPublicationWithChapters(...args),
    getReadProgress: vi.fn().mockResolvedValue({ lastReadChapterNumber: 0 }),
    getPublicationRatingStatus: vi.fn().mockResolvedValue({
      userScore: null,
      eligibility: 'guest',
    }),
    getPublicationGlossary: vi.fn().mockResolvedValue([]),
    getPublicEntityById: vi.fn().mockResolvedValue(null),
  },
}));

import { PublicationPage } from './PublicationPage.js';

function makePublication(
  overrides: Partial<PublicationWithChapters> = {}
): PublicationWithChapters {
  return {
    id: 'pub-1',
    projectId: 'proj-1',
    userId: 'user-1',
    status: 'published',
    title: 'Test Publication',
    description: 'Publication description',
    coverImageUrl: null,
    authorDisplay: 'Jane Author',
    translatorDisplay: null,
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    publishedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    slug: 'test-publication',
    chapters: [
      { id: 'ch1', number: 1, title: 'Opening', hasTranslation: true },
      { id: 'ch2', number: 2, title: 'Middle', hasTranslation: false },
    ],
    glossaryCount: 0,
    ...overrides,
  };
}

describe('PublicationPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows loading then publication metadata and chapters section', async () => {
    mocks.getPublicationWithChapters.mockResolvedValue(makePublication());
    render(<PublicationPage publicationId="pub-1" />);

    expect(screen.getByText('common.loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveProperty(
        'textContent',
        'Test Publication'
      );
      expect(screen.getByText('Publication description')).toBeTruthy();
      expect(screen.getByText('publication.chapters')).toBeTruthy();
      expect(screen.getByText('Opening')).toBeTruthy();
    });
  });

  it('shows not found when API fails', async () => {
    mocks.getPublicationWithChapters.mockRejectedValue(new Error('Not found'));
    render(<PublicationPage publicationId="missing" />);

    await waitFor(() => {
      expect(screen.getByText('publication.notFound')).toBeTruthy();
    });
  });
});
