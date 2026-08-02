// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../services/authService.js', () => ({
  AUTH_CHANGED_EVENT: 'arcane:auth-changed',
  authService: {
    getCurrentUser: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../components/ReadingMode', () => ({
  ReadingMode: () => <div data-testid="reading-mode" />,
}));

vi.mock('../api/client.js', () => ({
  api: {
    getPublicationWithChapters: (...args: unknown[]) => mocks.getPublicationWithChapters(...args),
    getReadProgress: vi.fn().mockResolvedValue({ lastReadChapterNumber: 0 }),
    getPublicationGlossary: vi.fn().mockResolvedValue([]),
    getPublicationChapter: vi.fn().mockResolvedValue({
      id: 'ch1',
      translatedText: 'Translated chapter text',
    }),
    updateReadProgress: vi.fn().mockResolvedValue(undefined),
  },
}));

import { PublicationReadingPage } from './PublicationReadingPage.js';

describe('PublicationReadingPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows loading then stubbed reading mode', async () => {
    mocks.getPublicationWithChapters.mockResolvedValue({
      id: 'pub-1',
      title: 'Reading Book',
      description: null,
      coverImageUrl: null,
      slug: 'reading-book',
      authorDisplay: 'Author',
      translatorDisplay: null,
      targetLanguage: 'ru',
      chapters: [{ id: 'ch1', number: 1, title: 'One', hasTranslation: true }],
      glossaryCount: 0,
    });

    render(<PublicationReadingPage publicationId="pub-1" chapterId="ch1" />);

    expect(screen.getByText('common.loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('reading-mode')).toBeTruthy();
    });
  });
});
