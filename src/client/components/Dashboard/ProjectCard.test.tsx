// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectListItem } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'projectCard.chaptersProgress' && opts) {
        return `${opts.translated}/${opts.total}`;
      }
      if (key === 'projectCard.daysAgo' && opts) {
        return `${opts.count} days ago`;
      }
      return key;
    },
  }),
}));

vi.mock('../../utils/analytics.js', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('./BookPlaceholder.js', () => ({
  BookPlaceholder: () => <div data-testid="book-placeholder" />,
}));

import { ProjectCard } from './ProjectCard.js';

const baseProject: ProjectListItem = {
  id: 'proj-1',
  name: 'My Novel',
  type: 'book',
  chapterCount: 10,
  translatedCount: 5,
  glossaryCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: new Date().toISOString(),
};

describe('ProjectCard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders project name, progress, and placeholder cover', () => {
    const onClick = vi.fn();
    render(<ProjectCard project={baseProject} onClick={onClick} />);

    expect(screen.getByText('My Novel')).toBeTruthy();
    expect(screen.getByText('5/10')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByTestId('book-placeholder')).toBeTruthy();
    expect(document.querySelector('.project-card')).toBeTruthy();
  });

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn();
    render(<ProjectCard project={baseProject} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith('proj-1');
  });

  it('shows chapter count in original reading mode', () => {
    const onClick = vi.fn();
    const project: ProjectListItem = {
      ...baseProject,
      originalReadingMode: true,
      chapterCount: 3,
      translatedCount: 0,
    };
    render(<ProjectCard project={project} onClick={onClick} />);

    expect(screen.getByText(/3 project\.chapterFew/)).toBeTruthy();
    expect(document.querySelector('.project-card-progress-overlay')).toBeNull();
  });
});
