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
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/useUserRole.js', () => ({
  useUserRole: () => ({
    user: { id: 'u1', role: 'author' },
    role: 'author',
    isGuest: false,
    isAtLeast: () => true,
    refresh: vi.fn(),
  }),
}));

vi.mock('../store/projects.js', () => ({
  projectsCache: mocks.projectsCache,
  projectsLoading: mocks.projectsLoading,
  loadProjects: mocks.loadProjects,
}));

vi.mock('../api/client.js', () => ({
  ApiError: class ApiError extends Error {
    code?: string;
    data?: unknown;
  },
  api: {
    createProject: vi.fn(),
  },
}));

vi.mock('../components/Dashboard/ProjectGrid', () => ({
  ProjectGrid: () => <div data-testid="project-grid" />,
}));

vi.mock('../components/Project/ProjectLanguagePairFields', () => ({
  ProjectLanguagePairFields: () => null,
}));

vi.mock('../components/ui', () => ({
  Button: ({ children, ...props }: { children?: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Modal: () => null,
  Icon: () => null,
  AlertModal: () => null,
}));

import { ProjectsPage } from './ProjectsPage.js';

describe('ProjectsPage', () => {
  afterEach(() => {
    cleanup();
    mocks.projectsCache.value = [];
  });

  it('renders dashboard title for author', () => {
    render(<ProjectsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      'dashboard.myProjects'
    );
    expect(screen.getByTestId('project-grid')).toBeTruthy();
  });
});
