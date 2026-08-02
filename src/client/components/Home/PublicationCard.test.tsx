// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicationListItem } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { title?: string; language?: string }) => {
      if (opts?.title) return `${key}:${opts.title}`;
      if (opts?.language) return `${key}:${opts.language}`;
      return key;
    },
  }),
}));

vi.mock('../../utils/analytics.js', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('./EntityChip.js', () => ({
  EntityChip: ({ display }: { display: string }) => (
    <span data-testid="entity-chip">{display}</span>
  ),
}));

import { trackEvent } from '../../utils/analytics.js';
import { PublicationCard } from './PublicationCard.js';

function makePublication(overrides: Partial<PublicationListItem> = {}): PublicationListItem {
  return {
    id: 'pub-1',
    projectId: 'proj-1',
    status: 'published',
    title: 'My Novel',
    description: 'A great story',
    coverImageUrl: null,
    authorDisplay: 'Author One',
    translatorDisplay: 'Translator Two',
    authorEntityId: 'auth-1',
    translatorEntityId: 'trans-1',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    slug: 'my-novel',
    translatedChapterCount: 5,
    ...overrides,
  };
}

describe('PublicationCard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders title and entity chips', () => {
    render(<PublicationCard publication={makePublication()} onRead={vi.fn()} />);
    expect(screen.getByText('My Novel')).toBeTruthy();
    expect(screen.getAllByTestId('entity-chip')).toHaveLength(2);
    expect(screen.getByText('Author One')).toBeTruthy();
    expect(screen.getByText('Translator Two')).toBeTruthy();
  });

  it('calls onRead with publication path when read button is clicked', () => {
    const onRead = vi.fn();
    render(<PublicationCard publication={makePublication()} onRead={onRead} />);

    fireEvent.click(screen.getByText('home.read'));
    expect(onRead).toHaveBeenCalledWith('my-novel');
    expect(trackEvent).toHaveBeenCalledWith('select_content', {
      content_type: 'publication',
      item_id: 'pub-1',
    });
  });

  it('calls onRead with continue chapter when reading progress exists', () => {
    const onRead = vi.fn();
    render(
      <PublicationCard
        publication={makePublication()}
        onRead={onRead}
        readingProgress={{ lastReadChapterNumber: 3, continueChapterId: 'ch-3' }}
      />
    );

    fireEvent.click(screen.getByText('profile.continue'));
    expect(onRead).toHaveBeenCalledWith('my-novel', 'ch-3');
  });

  it('opens publication when card area is clicked', () => {
    const onRead = vi.fn();
    render(<PublicationCard publication={makePublication()} onRead={onRead} />);

    fireEvent.click(screen.getByRole('button', { name: 'home.openPublicationAria:My Novel' }));
    expect(onRead).toHaveBeenCalledWith('my-novel');
  });
});
