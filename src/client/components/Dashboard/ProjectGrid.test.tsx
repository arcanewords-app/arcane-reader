// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectListItem } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./ProjectCard.js', () => ({
  ProjectCard: ({ project }: { project: ProjectListItem }) => (
    <div data-testid="project-card">{project.name}</div>
  ),
}));

import { ProjectGrid } from './ProjectGrid.js';

const projects: ProjectListItem[] = [
  {
    id: 'p1',
    name: 'Alpha',
    type: 'book',
    chapterCount: 1,
    translatedCount: 1,
    glossaryCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'p2',
    name: 'Beta',
    type: 'text',
    chapterCount: 2,
    translatedCount: 0,
    glossaryCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
];

describe('ProjectGrid', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows loading spinner while loading', () => {
    render(<ProjectGrid projects={[]} loading onSelectProject={vi.fn()} />);
    expect(screen.getByText('projectGrid.loadingProjects')).toBeTruthy();
    expect(document.querySelector('.project-grid-loading')).toBeTruthy();
  });

  it('shows empty state when there are no projects', () => {
    render(<ProjectGrid projects={[]} onSelectProject={vi.fn()} />);
    expect(screen.getByText('project.noProjects')).toBeTruthy();
    expect(document.querySelector('.project-grid-empty')).toBeTruthy();
  });

  it('shows filtered empty state when search yields nothing', () => {
    render(<ProjectGrid projects={projects} searchQuery="missing" onSelectProject={vi.fn()} />);
    expect(screen.getByText('projectGrid.noProjectsFound')).toBeTruthy();
  });

  it('renders project cards for filtered list', () => {
    render(<ProjectGrid projects={projects} onSelectProject={vi.fn()} />);
    expect(document.querySelector('.project-grid')).toBeTruthy();
    expect(screen.getAllByTestId('project-card')).toHaveLength(2);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });
});
