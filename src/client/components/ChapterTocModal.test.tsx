// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function manyChapters(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `ch${i + 1}`,
    number: i + 1,
    title: `Chapter ${i + 1}`,
  }));
}

describe('ChapterTocModal', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.unstubAllGlobals();
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

  it('shows watermark bookmark without per-chapter check or mark controls', () => {
    const { container } = render(
      <ChapterTocModal
        isOpen
        onClose={vi.fn()}
        chapters={chapters}
        onSelectChapter={vi.fn()}
        lastReadChapterNumber={1}
      />
    );

    expect(container.querySelector('.reading-toc-mark-read')).toBeNull();
    expect(container.querySelector('.reading-toc-read')).toBeNull();
    expect(container.querySelector('.reading-toc-continue')).toBeTruthy();
    expect(container.querySelector('.reading-toc-item.last-read')).toBeTruthy();
    expect(container.querySelector('.reading-toc-item.read')).toBeTruthy();
  });

  it('marks current chapter with active class, badge, and aria-current', () => {
    const { container } = render(
      <ChapterTocModal
        isOpen
        onClose={vi.fn()}
        chapters={chapters}
        onSelectChapter={vi.fn()}
        currentChapterId="ch2"
      />
    );

    const active = container.querySelector(
      '.reading-toc-item.active[data-toc-chapter-id="ch2"]'
    ) as HTMLButtonElement | null;
    expect(active).toBeTruthy();
    expect(active?.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('readingMode.current')).toBeTruthy();
    expect(
      container.querySelector('.reading-toc-item.active[data-toc-chapter-id="ch1"]')
    ).toBeNull();
  });

  it('does not mark any chapter active without currentChapterId', () => {
    const { container } = render(
      <ChapterTocModal isOpen onClose={vi.fn()} chapters={chapters} onSelectChapter={vi.fn()} />
    );
    expect(container.querySelector('.reading-toc-item.active')).toBeNull();
    expect(container.querySelector('.reading-toc-current')).toBeNull();
  });

  it('scrolls virtualized list so current mid-list chapter is in the DOM', () => {
    const list = manyChapters(60);
    const { container } = render(
      <ChapterTocModal
        isOpen
        onClose={vi.fn()}
        chapters={list}
        onSelectChapter={vi.fn()}
        currentChapterId="ch55"
      />
    );

    const listEl = container.querySelector('.reading-toc-list') as HTMLDivElement;
    Object.defineProperty(listEl, 'clientHeight', { configurable: true, value: 400 });
    // Re-render trigger: fire a scroll after forcing layout by toggling order is heavy;
    // instead re-open is not needed — layout effect already ran. Spy scrollTop after paint.
    expect(listEl.scrollTop).toBeGreaterThan(0);
    expect(container.querySelector('[data-toc-chapter-id="ch55"]')).toBeTruthy();
    expect(container.querySelector('.reading-toc-item.active')).toBeTruthy();
  });

  it('keeps current chapter active after switching to descending order', () => {
    const list = manyChapters(10);
    const { container } = render(
      <ChapterTocModal
        isOpen
        onClose={vi.fn()}
        chapters={list}
        onSelectChapter={vi.fn()}
        currentChapterId="ch3"
      />
    );

    fireEvent.click(screen.getByText('publication.orderFromEnd'));
    const active = container.querySelector('.reading-toc-item.active[data-toc-chapter-id="ch3"]');
    expect(active).toBeTruthy();
    expect(screen.getByText('readingMode.current')).toBeTruthy();
  });

  it('does not crash when search hides the current chapter', () => {
    const { container } = render(
      <ChapterTocModal
        isOpen
        onClose={vi.fn()}
        chapters={chapters}
        onSelectChapter={vi.fn()}
        currentChapterId="ch2"
      />
    );

    const input = container.querySelector('.toc-search-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Opening' } });

    expect(container.querySelector('.reading-toc-item.active')).toBeNull();
    expect(screen.getByText('Opening')).toBeTruthy();
    expect(screen.queryByText('Middle')).toBeNull();
  });

  it('shows watermark and current on different chapters when they differ', () => {
    const list = [
      { id: 'ch1', number: 1, title: 'One' },
      { id: 'ch2', number: 2, title: 'Two' },
      { id: 'ch3', number: 3, title: 'Three' },
    ];
    const { container } = render(
      <ChapterTocModal
        isOpen
        onClose={vi.fn()}
        chapters={list}
        onSelectChapter={vi.fn()}
        currentChapterId="ch3"
        lastReadChapterNumber={1}
      />
    );

    expect(container.querySelector('[data-toc-chapter-id="ch3"].active')).toBeTruthy();
    expect(container.querySelector('[data-toc-chapter-id="ch1"].last-read')).toBeTruthy();
    expect(container.querySelector('[data-toc-chapter-id="ch3"].last-read')).toBeNull();
    expect(container.querySelector('[data-toc-chapter-id="ch1"].active')).toBeNull();
  });
});
