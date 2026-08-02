// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./ui', () => ({
  Modal: ({
    isOpen,
    title,
    children,
    footer,
  }: {
    isOpen: boolean;
    title?: string;
    children?: unknown;
    footer?: unknown;
  }) =>
    isOpen ? (
      <div data-testid="toc-modal">
        <h2>{title}</h2>
        {children}
        {footer}
      </div>
    ) : null,
  Button: ({ children, onClick }: { children?: unknown; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  Icon: () => null,
}));

import { ChapterTocModal } from './ChapterTocModal.js';

const chapters = [
  { id: 'ch1', number: 1, title: 'Opening' },
  { id: 'ch2', number: 2, title: 'Middle' },
];

describe('ChapterTocModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders chapter list when open', () => {
    render(
      <ChapterTocModal isOpen onClose={vi.fn()} chapters={chapters} onSelectChapter={vi.fn()} />
    );
    expect(screen.getByTestId('toc-modal')).toBeTruthy();
    expect(screen.getByText('Opening')).toBeTruthy();
    expect(screen.getByText('Middle')).toBeTruthy();
  });

  it('calls onSelectChapter when a chapter is clicked', () => {
    const onSelectChapter = vi.fn();
    render(
      <ChapterTocModal
        isOpen
        onClose={vi.fn()}
        chapters={chapters}
        onSelectChapter={onSelectChapter}
      />
    );

    fireEvent.click(screen.getByText('Middle'));
    expect(onSelectChapter).toHaveBeenCalledWith('ch2');
  });
});
