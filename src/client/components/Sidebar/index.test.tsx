// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../types.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('./ChapterList', () => ({
  ChapterList: () => <div data-testid="chapter-list" />,
}));

vi.mock('./ProcessChapters', () => ({
  ProcessChapters: () => null,
}));

vi.mock('./JobsPanel', () => ({
  JobsPanel: () => null,
}));

vi.mock('./SettingsModal', () => ({
  SettingsModal: () => null,
}));

vi.mock('../SearchReplace', () => ({
  ProjectSearchModal: () => null,
}));

import { Sidebar } from './index.js';

function makeProject(): Project {
  return {
    id: 'p1',
    name: 'Test Project',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    chapters: [],
    glossary: [{ id: 'g1', name: 'Hero', type: 'character' } as Project['glossary'][0]],
    settings: {
      temperature: 0.7,
      stageModels: {
        analysis: 'gpt-4.1-mini',
        translation: 'gpt-4.1-mini',
        editing: 'gpt-4.1-mini',
      },
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const baseProps = {
  selectedChapterId: null as string | null,
  onSelectChapter: vi.fn(),
  onUploadChapter: vi.fn(),
  onOpenGlossary: vi.fn(),
};

describe('Sidebar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('returns null when project is absent', () => {
    const { container } = render(<Sidebar project={null} {...baseProps} />);
    expect(container.textContent).toBe('');
  });

  it('renders project chrome and mocked chapter list', () => {
    render(<Sidebar project={makeProject()} {...baseProps} />);

    expect(screen.getByText('Test Project')).toBeTruthy();
    expect(screen.getByTestId('chapter-list')).toBeTruthy();
    expect(screen.getByText('sidebar.allProjects')).toBeTruthy();
    expect(screen.getByText('sidebar.glossary')).toBeTruthy();
  });
});
