// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectWithChapterList } from '../types';

const mocks = vi.hoisted(() => {
  const mockProject: ProjectWithChapterList = {
    id: 'proj-1',
    name: 'Test Project',
    chapters: [{ id: 'ch1', number: 1, title: 'One', status: 'completed' }],
    glossary: [],
    settings: {},
  } as ProjectWithChapterList;
  return {
    mockProject,
    getProject: vi.fn().mockResolvedValue(mockProject),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../store/projects.js', () => ({
  getProject: (...args: unknown[]) => mocks.getProject(...args),
}));

vi.mock('../hooks/useUrlSync.js', () => ({
  useUrlSync: () => ({
    state: '',
    setState: vi.fn(),
  }),
}));

vi.mock('../utils/analytics.js', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../api/client.js', () => ({
  api: {
    getProjectReportsCount: vi.fn().mockResolvedValue({ count: 0 }),
    uploadChapter: vi.fn(),
    deleteChapter: vi.fn(),
  },
}));

vi.mock('../components/ProjectInfo.js', () => ({
  ProjectInfo: () => <div data-testid="project-info" />,
}));

vi.mock('../components/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock('../components/Glossary', () => ({
  GlossaryModal: () => null,
}));

vi.mock('../components/Reports', () => ({
  ReportsModal: () => null,
}));

vi.mock('../components/ui', () => ({
  PageLoading: ({ text }: { text?: string }) => <div data-testid="page-loading">{text}</div>,
}));

import { ProjectPage } from './ProjectPage.js';

describe('ProjectPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows loading then project shell', async () => {
    render(<ProjectPage projectId="proj-1" />);
    expect(screen.getByTestId('page-loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('project-info')).toBeTruthy();
      expect(screen.getByTestId('sidebar')).toBeTruthy();
    });
  });
});
