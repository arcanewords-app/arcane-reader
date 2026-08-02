// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectWithChapterList } from '../../types';

const mocks = vi.hoisted(() => ({
  projectsCache: { value: [] as unknown[] },
  loadProjects: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('../../store/projects.js', () => ({
  projectsCache: mocks.projectsCache,
  loadProjects: mocks.loadProjects,
}));

vi.mock('../../api/client.js', () => ({
  api: {
    transferChaptersFromProject: vi.fn(),
  },
}));

import { api } from '../../api/client.js';
import { CopyChaptersModal } from './CopyChaptersModal.js';

const project: ProjectWithChapterList = {
  id: 'proj-1',
  name: 'Source',
  sourceLanguage: 'en',
  targetLanguage: 'ru',
  chapters: [
    { id: 'ch1', number: 1, title: 'One', status: 'completed' },
    { id: 'ch2', number: 2, title: 'Two', status: 'pending' },
  ],
} as ProjectWithChapterList;

describe('CopyChaptersModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    mocks.projectsCache.value = [];
    vi.clearAllMocks();
  });

  it('renders when open with chapter list', () => {
    mocks.projectsCache.value = [
      {
        id: 'proj-2',
        name: 'Target',
        sourceLanguage: 'en',
        targetLanguage: 'ru',
      },
    ];
    render(<CopyChaptersModal isOpen onClose={vi.fn()} project={project} onSuccess={vi.fn()} />);
    expect(screen.getByText('copyChapters.modalTitle')).toBeTruthy();
    expect(screen.getByText('One')).toBeTruthy();
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    render(<CopyChaptersModal isOpen onClose={onClose} project={project} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText('common.cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs confirm flow when target project is selected', async () => {
    mocks.projectsCache.value = [
      {
        id: 'proj-2',
        name: 'Target',
        sourceLanguage: 'en',
        targetLanguage: 'ru',
      },
    ];
    const onClose = vi.fn();
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.transferChaptersFromProject).mockResolvedValue({
      chaptersTransferred: 2,
      glossaryAdded: 0,
      glossarySkipped: 0,
    });

    render(<CopyChaptersModal isOpen onClose={onClose} project={project} onSuccess={onSuccess} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await act(async () => {
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const confirmBtn = screen.getByText('chapterTransfer.confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.transferChaptersFromProject).toHaveBeenCalledWith('proj-2', {
        sourceProjectId: 'proj-1',
        chapterIds: ['ch1', 'ch2'],
        includeGlossary: false,
      });
      expect(onClose).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
