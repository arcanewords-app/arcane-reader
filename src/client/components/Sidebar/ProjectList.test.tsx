// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectListItem } from '../../types';

const mocks = vi.hoisted(() => ({
  projectsCache: { value: [] as ProjectListItem[] },
  loadProjectsStore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../store/projects.js', () => ({
  projectsCache: mocks.projectsCache,
  loadProjects: mocks.loadProjectsStore,
}));

vi.mock('../../api/client.js', () => ({
  api: { createProject: vi.fn() },
  ApiError: class ApiError extends Error {
    status?: number;
  },
}));

vi.mock('../Project/ProjectLanguagePairFields', () => ({
  ProjectLanguagePairFields: () => null,
}));

vi.mock('../ui', () => ({
  Button: ({ children, ...props }: { children?: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Card: ({ title, children }: { title?: string; children?: unknown }) => (
    <div data-testid="card">
      {title ? <h2>{title}</h2> : null}
      {children}
    </div>
  ),
  Modal: () => null,
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Icon: () => null,
}));

import { ProjectList } from './ProjectList.js';

const sampleProjects: ProjectListItem[] = [
  {
    id: 'p1',
    name: 'Novel A',
    type: 'book',
    chapterCount: 3,
    translatedCount: 1,
    glossaryCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
];

describe('ProjectList', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    mocks.projectsCache.value = [];
    vi.clearAllMocks();
  });

  it('shows empty state when there are no projects', async () => {
    render(<ProjectList selectedId={null} onSelect={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('project.noProjects')).toBeTruthy();
    });
  });

  it('calls onSelect when a project is clicked', async () => {
    mocks.projectsCache.value = sampleProjects;
    const onSelect = vi.fn();
    render(<ProjectList selectedId={null} onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('Novel A')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Novel A'));
    expect(onSelect).toHaveBeenCalledWith('p1');
  });
});
