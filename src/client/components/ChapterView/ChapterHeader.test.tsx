// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Chapter } from '../../types.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../api/client.js', () => ({
  api: {
    updateChapterTitle: vi.fn(),
  },
}));

vi.mock('./ChapterStatusSelect.js', () => ({
  ChapterStatusSelect: () => <div data-testid="chapter-status-select" />,
}));

import { ChapterHeader } from './ChapterHeader.js';

const baseChapter = {
  id: 'ch1',
  number: 1,
  title: 'Chapter One',
  originalText: 'Original',
  translatedText: 'Translated',
  status: 'draft',
  paragraphs: [{ id: 'p1', originalText: 'Hi', translatedText: 'Hello' }],
} as Chapter;

function renderHeader(overrides: Partial<Parameters<typeof ChapterHeader>[0]> = {}) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  render(
    <ChapterHeader
      chapter={baseChapter}
      projectId="proj-1"
      canPrev
      canNext
      onPrev={onPrev}
      onNext={onNext}
      onToggleTranslationPanel={vi.fn()}
      onToggleSettings={vi.fn()}
      onChapterUpdate={vi.fn()}
      {...overrides}
    />
  );
  return { onPrev, onNext };
}

describe('ChapterHeader', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('shows skeleton actions and list title while chapter is loading', () => {
    render(
      <ChapterHeader
        chapter={null}
        chapterListItem={{ id: 'ch1', number: 1, title: 'Loading chapter', status: 'pending' }}
        projectId="proj-1"
        canPrev={false}
        canNext
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToggleTranslationPanel={vi.fn()}
        onToggleSettings={vi.fn()}
        onChapterUpdate={vi.fn()}
        isLoading
      />
    );

    expect(screen.getByText('Loading chapter')).toBeTruthy();
    expect(screen.queryByTestId('chapter-status-select')).toBeNull();
  });

  it('calls prev and next navigation handlers', () => {
    const { onPrev, onNext } = renderHeader();
    const navButtons = document.querySelectorAll('.chapter-nav-btn');
    fireEvent.click(navButtons[0] as HTMLButtonElement);
    fireEvent.click(navButtons[1] as HTMLButtonElement);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('disables nav buttons when canPrev and canNext are false', () => {
    renderHeader({ canPrev: false, canNext: false });
    const navButtons = document.querySelectorAll('.chapter-nav-btn');
    expect((navButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((navButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders status select when chapter is loaded', () => {
    renderHeader();
    expect(screen.getByTestId('chapter-status-select')).toBeTruthy();
  });

  it('critic menu item triggers upgrade when locked', () => {
    const onCriticUpgrade = vi.fn();
    renderHeader({
      canUseCritic: false,
      onCriticUpgrade,
      onEnterCriticMode: vi.fn(),
    });

    fireEvent.click(screen.getByLabelText('chapter.actionsMenu'));
    fireEvent.click(screen.getByText('critic.menuLabel'));
    expect(onCriticUpgrade).toHaveBeenCalledTimes(1);
  });

  it('critic menu item enters critic mode when allowed', () => {
    const onEnterCriticMode = vi.fn();
    renderHeader({
      canUseCritic: true,
      onEnterCriticMode,
    });

    fireEvent.click(screen.getByLabelText('chapter.actionsMenu'));
    fireEvent.click(screen.getByText('critic.menuLabel'));
    expect(onEnterCriticMode).toHaveBeenCalledTimes(1);
  });
});
