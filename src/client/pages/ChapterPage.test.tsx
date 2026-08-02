// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Chapter, ProjectWithChapterList } from '../types';

const mocks = vi.hoisted(() => {
  const mockProject: ProjectWithChapterList = {
    id: 'proj-1',
    name: 'Test Project',
    chapters: [{ id: 'ch1', number: 1, title: 'One', status: 'completed' }],
    glossary: [],
    settings: {},
  } as ProjectWithChapterList;
  const mockChapter = {
    id: 'ch1',
    number: 1,
    title: 'One',
    status: 'completed',
    originalText: 'Original',
    paragraphs: [],
  } as Chapter;
  return {
    mockProject,
    mockChapter,
    getProject: vi.fn().mockResolvedValue(mockProject),
    getChapter: vi.fn().mockResolvedValue(mockChapter),
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
  updateProjectCache: vi.fn(),
}));

vi.mock('../api/client.js', () => ({
  api: {
    getProjectReportsCount: vi.fn().mockResolvedValue({ count: 0 }),
    getChapter: (...args: unknown[]) => mocks.getChapter(...args),
    getChapterFresh: vi.fn(),
    uploadChapter: vi.fn(),
    deleteChapter: vi.fn(),
  },
}));

vi.mock('../components/ChapterView', () => ({
  ChapterView: () => <div data-testid="chapter-view" />,
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

import { ChapterPage } from './ChapterPage.js';

describe('ChapterPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows loading then chapter editor shell', async () => {
    render(<ChapterPage projectId="proj-1" chapterId="ch1" />);
    expect(screen.getByText('common.loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('sidebar')).toBeTruthy();
      expect(screen.getByTestId('chapter-view')).toBeTruthy();
    });
  });
});
