// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'profile.quotesChapterMeta' && opts) {
        return `Chapter ${opts.number}`;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../api/client.js', () => ({
  api: {
    getUserQuotes: vi.fn(),
    deleteUserQuote: vi.fn(),
  },
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../Dashboard/BookPlaceholder.js', () => ({
  BookPlaceholder: () => <div data-testid="book-placeholder" />,
}));

import { api } from '../../api/client.js';
import { QuotesSection } from './QuotesSection.js';

const quoteItem = {
  id: 'q1',
  publicationId: 'pub1',
  chapterId: 'ch1',
  chapterNumber: 2,
  quoteText: 'A memorable line',
  startParagraph: 3,
  createdAt: '2026-01-15T12:00:00.000Z',
  publicationTitle: 'Great Book',
  publicationSlug: 'great-book',
  coverImageUrl: null,
};

describe('QuotesSection', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('shows loading spinner while fetching quotes', () => {
    vi.mocked(api.getUserQuotes).mockReturnValue(new Promise(() => {}));

    render(<QuotesSection />);
    expect(screen.getByText('profile.loadingQuotes')).toBeTruthy();
  });

  it('shows empty state when there are no quotes', async () => {
    vi.mocked(api.getUserQuotes).mockResolvedValue({ items: [] });

    render(<QuotesSection />);

    await waitFor(() => {
      expect(screen.getByText('profile.quotesEmpty')).toBeTruthy();
    });
  });

  it('lists quotes and opens delete modal', async () => {
    vi.mocked(api.getUserQuotes).mockResolvedValue({ items: [quoteItem] });
    vi.mocked(api.deleteUserQuote).mockResolvedValue(undefined as never);

    render(<QuotesSection />);

    await waitFor(() => {
      expect(screen.getByText('Great Book')).toBeTruthy();
      expect(screen.getByText('«A memorable line»')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('profile.quotesDelete'));
    expect(screen.getByText('profile.quotesDeleteTitle')).toBeTruthy();

    fireEvent.click(screen.getAllByText('profile.quotesDelete')[1]!);

    await waitFor(() => {
      expect(api.deleteUserQuote).toHaveBeenCalledWith('q1');
    });
  });
});
