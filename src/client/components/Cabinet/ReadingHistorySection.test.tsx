// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../hooks/useReadingHistory', () => ({
  useReadingHistory: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  api: {
    resetReadProgress: vi.fn(),
  },
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../Dashboard/BookPlaceholder', () => ({
  BookPlaceholder: () => <div data-testid="book-placeholder" />,
}));

import { api } from '../../api/client.js';
import { useReadingHistory, type ReadingHistoryItem } from '../../hooks/useReadingHistory.js';
import { ReadingHistorySection } from './ReadingHistorySection.js';

const historyItem: ReadingHistoryItem = {
  publicationId: 'pub1',
  title: 'My Book',
  coverImageUrl: null,
  slug: 'my-book',
  totalChapters: 10,
  readCount: 3,
  lastReadChapterNumber: 3,
  continueChapterId: 'ch3',
  lastReadAt: null,
};

describe('ReadingHistorySection', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('shows loading spinner text while loading', () => {
    vi.mocked(useReadingHistory).mockReturnValue({
      items: [],
      loading: true,
      reload: vi.fn(),
      removeItem: vi.fn(),
    });

    render(<ReadingHistorySection />);
    expect(screen.getByText('profile.loadingReadingHistory')).toBeTruthy();
  });

  it('shows empty state when there are no items', () => {
    vi.mocked(useReadingHistory).mockReturnValue({
      items: [],
      loading: false,
      reload: vi.fn(),
      removeItem: vi.fn(),
    });

    render(<ReadingHistorySection />);
    expect(screen.getByText('profile.noReadingHistory')).toBeTruthy();
  });

  it('lists items, opens reset modal, and calls resetReadProgress on confirm', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const removeItem = vi.fn();
    vi.mocked(useReadingHistory).mockReturnValue({
      items: [historyItem],
      loading: false,
      reload,
      removeItem,
    });
    vi.mocked(api.resetReadProgress).mockResolvedValue(undefined as never);

    render(<ReadingHistorySection />);

    expect(screen.getByText('My Book')).toBeTruthy();
    expect(screen.getByText('profile.continue')).toBeTruthy();

    fireEvent.click(screen.getByText('readingProgress.reset'));
    expect(screen.getByText('readingProgress.resetConfirmTitle')).toBeTruthy();

    fireEvent.click(screen.getByText('readingProgress.resetConfirmYes'));

    await waitFor(() => {
      expect(removeItem).toHaveBeenCalledWith('pub1');
      expect(api.resetReadProgress).toHaveBeenCalledWith('pub1');
      expect(reload).toHaveBeenCalled();
    });
  });
});
