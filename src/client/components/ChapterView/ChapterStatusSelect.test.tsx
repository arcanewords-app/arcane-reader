// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../api/client', () => ({
  api: {
    updateChapterStatus: vi.fn(),
  },
}));

import { api } from '../../api/client.js';
import type { Chapter } from '../../types.js';
import { ChapterStatusSelect } from './ChapterStatusSelect.js';

const draftChapter = {
  id: 'c1',
  number: 1,
  title: 'Chapter 1',
  originalText: 'Original',
  status: 'draft',
} as Chapter;

const translatingChapter = {
  ...draftChapter,
  status: 'translating',
} as Chapter;

describe('ChapterStatusSelect', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('translating status renders StatusBadge only without change trigger', () => {
    render(
      <ChapterStatusSelect chapter={translatingChapter} projectId="p1" onChapterUpdate={vi.fn()} />
    );

    expect(screen.getByText(/status\.translating/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'chapter.changeStatus' })).toBeNull();
  });

  it('opens modal and updates status to pending via API', async () => {
    const updatedChapter = { ...draftChapter, status: 'pending' as const };
    vi.mocked(api.updateChapterStatus).mockResolvedValue(updatedChapter);
    const onChapterUpdate = vi.fn();

    render(
      <ChapterStatusSelect
        chapter={draftChapter}
        projectId="p1"
        onChapterUpdate={onChapterUpdate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'chapter.changeStatus' }));
    expect(screen.getByText('chapter.changeStatusTitle')).toBeTruthy();

    const pendingOption = document.querySelector(
      '.chapter-status-select-option:not(.is-current)'
    ) as HTMLButtonElement;
    expect(pendingOption).toBeTruthy();
    fireEvent.click(pendingOption);

    await waitFor(() => {
      expect(api.updateChapterStatus).toHaveBeenCalledWith('p1', 'c1', 'pending');
      expect(onChapterUpdate).toHaveBeenCalledWith(updatedChapter);
    });
  });
});
