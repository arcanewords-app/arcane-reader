// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectWithChapterList } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      if (opts?.count != null) return `${key}:${opts.count}`;
      return key;
    },
  }),
}));

vi.mock('./ChapterPickerPanel.js', () => ({
  ChapterPickerPanel: ({
    onSelectedIdsChange,
  }: {
    onSelectedIdsChange: (ids: string[]) => void;
  }) => (
    <button type="button" onClick={() => onSelectedIdsChange(['ch1'])}>
      Select chapter
    </button>
  ),
}));

vi.mock('../../api/client.js', () => ({
  api: {
    bulkDeleteChapters: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { api } from '../../api/client.js';
import { BulkDeleteChaptersModal } from './BulkDeleteChaptersModal.js';

const project: ProjectWithChapterList = {
  id: 'proj-1',
  name: 'Test',
  chapters: [
    { id: 'ch1', number: 1, title: 'One', status: 'completed' },
    { id: 'ch2', number: 2, title: 'Two', status: 'pending' },
  ],
} as ProjectWithChapterList;

describe('BulkDeleteChaptersModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('disables delete until chapters are selected', () => {
    render(
      <BulkDeleteChaptersModal isOpen onClose={vi.fn()} project={project} onSuccess={vi.fn()} />
    );

    const deleteBtn = screen.getByText('bulkDeleteChapters.deleteButton:0');
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('runs confirm flow and shows success alert', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.bulkDeleteChapters).mockResolvedValue({ deleted: 1 });

    render(
      <BulkDeleteChaptersModal isOpen onClose={onClose} project={project} onSuccess={onSuccess} />
    );

    fireEvent.click(screen.getByText('Select chapter'));
    fireEvent.click(screen.getByText('bulkDeleteChapters.deleteButton:1'));
    expect(screen.getByText('chapterActions.deleteConfirmTitle')).toBeTruthy();

    fireEvent.click(screen.getByText('common.delete'));

    await waitFor(() => {
      expect(api.bulkDeleteChapters).toHaveBeenCalledWith('proj-1', ['ch1']);
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      expect(screen.getByText('chapterActions.deleteSuccessTitle')).toBeTruthy();
    });
  });
});
