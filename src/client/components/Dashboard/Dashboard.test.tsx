// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const projects: { value: unknown[] } = { value: [] };
  const loading: { value: boolean } = { value: false };
  return {
    projectsCache: projects,
    projectsLoading: loading,
    loadProjects: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../../store/projects.js', () => ({
  projectsCache: mocks.projectsCache,
  projectsLoading: mocks.projectsLoading,
  loadProjects: mocks.loadProjects,
}));

vi.mock('../../api/client.js', () => ({
  api: { createProject: vi.fn() },
}));

vi.mock('./ProjectGrid', () => ({
  ProjectGrid: ({ loading, projects }: { loading?: boolean; projects: unknown[] }) => (
    <div
      data-testid="project-grid"
      data-loading={loading ? 'true' : 'false'}
      data-count={String(projects.length)}
    />
  ),
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
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Modal: () => null,
  Icon: () => null,
}));

import { Dashboard } from './Dashboard.js';

describe('Dashboard', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    mocks.projectsCache.value = [];
    mocks.projectsLoading.value = false;
    vi.clearAllMocks();
  });

  it('shows empty subtitle when there are no projects', () => {
    render(<Dashboard />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      'dashboard.myProjects'
    );
    expect(screen.getByText('dashboard.subtitleEmpty')).toBeTruthy();
    expect(screen.getByTestId('project-grid')).toHaveProperty('dataset.count', '0');
  });

  it('passes loading state to ProjectGrid', () => {
    mocks.projectsLoading.value = true;
    render(<Dashboard />);
    expect(screen.getByTestId('project-grid')).toHaveProperty('dataset.loading', 'true');
  });

  it('shows filters and project count when projects exist', () => {
    mocks.projectsCache.value = [
      { id: 'p1', name: 'Alpha', type: 'book' },
      { id: 'p2', name: 'Beta', type: 'text' },
    ];
    render(<Dashboard />);
    expect(screen.getByTestId('project-grid')).toHaveProperty('dataset.count', '2');
    expect(screen.getByPlaceholderText('dashboard.searchPlaceholder')).toBeTruthy();
    expect(screen.getByText(/dashboard.filterAll/)).toBeTruthy();
  });
});
