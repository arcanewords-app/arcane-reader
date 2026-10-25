// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectWithChapterList } from '../../types';

const { selectedIdsRef } = vi.hoisted(() => ({
  selectedIdsRef: { current: ['ch1'] as string[] },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number; done?: number; total?: number }) => {
      if (opts?.done != null && opts.total != null) return `${key}:${opts.done}/${opts.total}`;
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
    <button type="button" onClick={() => onSelectedIdsChange(selectedIdsRef.current)}>
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
import { BULK_DELETE_CHAPTER_BATCH, BulkDeleteChaptersModal } from './BulkDeleteChaptersModal.js';

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
    selectedIdsRef.current = ['ch1'];
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

  it('deletes in batches and sums deleted counts', async () => {
    const ids = Array.from({ length: BULK_DELETE_CHAPTER_BATCH + 1 }, (_, index) => `ch${index}`);
    selectedIdsRef.current = ids;
    const onClose = vi.fn();
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.bulkDeleteChapters)
      .mockResolvedValueOnce({ deleted: BULK_DELETE_CHAPTER_BATCH })
      .mockResolvedValueOnce({ deleted: 1 });

    render(
      <BulkDeleteChaptersModal isOpen onClose={onClose} project={project} onSuccess={onSuccess} />
    );

    fireEvent.click(screen.getByText('Select chapter'));
    fireEvent.click(screen.getByText(`bulkDeleteChapters.deleteButton:${ids.length}`));
    fireEvent.click(screen.getByText('common.delete'));

    await waitFor(() => {
      expect(api.bulkDeleteChapters).toHaveBeenCalledTimes(2);
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(screen.getByText(`chapterActions.deleteSuccessMessage:${ids.length}`)).toBeTruthy();
    });
    expect(api.bulkDeleteChapters).toHaveBeenNthCalledWith(1, 'proj-1', ids.slice(0, 25));
    expect(api.bulkDeleteChapters).toHaveBeenNthCalledWith(2, 'proj-1', ids.slice(25));
  });

  it('refreshes the list when a later batch fails', async () => {
    const ids = Array.from({ length: BULK_DELETE_CHAPTER_BATCH + 1 }, (_, index) => `ch${index}`);
    selectedIdsRef.current = ids;
    const onClose = vi.fn();
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.bulkDeleteChapters)
      .mockResolvedValueOnce({ deleted: BULK_DELETE_CHAPTER_BATCH })
      .mockRejectedValueOnce(new Error('statement timeout'));

    render(
      <BulkDeleteChaptersModal isOpen onClose={onClose} project={project} onSuccess={onSuccess} />
    );

    fireEvent.click(screen.getByText('Select chapter'));
    fireEvent.click(screen.getByText(`bulkDeleteChapters.deleteButton:${ids.length}`));
    fireEvent.click(screen.getByText('common.delete'));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(screen.getByText('chapterActions.deleteErrorTitle')).toBeTruthy();
      expect(screen.getByText('statement timeout')).toBeTruthy();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
