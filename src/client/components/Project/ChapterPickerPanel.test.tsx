// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChapterPickerItem } from './chapterPickerShared.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ChapterPickerPanel } from './ChapterPickerPanel.js';

const mockChapters: ChapterPickerItem[] = [
  { id: 'c1', number: 1, title: 'Alpha', status: 'completed' },
  { id: 'c2', number: 2, title: 'Beta', status: 'error' },
  { id: 'c3', number: 3, title: 'Gamma', status: 'pending' },
  { id: 'c4', number: 4, title: 'Delta', status: 'draft' },
];

describe('ChapterPickerPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders chapters and toggles checkbox selection', () => {
    const onSelectedIdsChange = vi.fn();
    render(
      <ChapterPickerPanel
        chapters={mockChapters}
        selectedIds={[]}
        onSelectedIdsChange={onSelectedIdsChange}
      />
    );

    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onSelectedIdsChange).toHaveBeenCalled();
    const updater = onSelectedIdsChange.mock.calls[0][0];
    expect(typeof updater).toBe('function');
    expect(updater([])).toEqual(['c1']);
  });

  it('select all adds every filtered chapter id', () => {
    const onSelectedIdsChange = vi.fn();
    render(
      <ChapterPickerPanel
        chapters={mockChapters}
        selectedIds={[]}
        onSelectedIdsChange={onSelectedIdsChange}
      />
    );

    fireEvent.click(screen.getByText('chapter.selectAll'));

    expect(onSelectedIdsChange).toHaveBeenCalledWith(['c1', 'c2', 'c3', 'c4']);
  });

  it('applies completed preset filter and selects matching chapters', () => {
    const onSelectedIdsChange = vi.fn();
    render(
      <ChapterPickerPanel
        chapters={mockChapters}
        selectedIds={[]}
        onSelectedIdsChange={onSelectedIdsChange}
      />
    );

    fireEvent.click(screen.getByText('projectInfo.presetTranslated'));

    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByText('Beta')).toBeNull();
    expect(onSelectedIdsChange).toHaveBeenCalledWith(['c1']);
  });

  it('deselect all clears selection', () => {
    const onSelectedIdsChange = vi.fn();
    render(
      <ChapterPickerPanel
        chapters={mockChapters}
        selectedIds={['c1', 'c2']}
        onSelectedIdsChange={onSelectedIdsChange}
      />
    );

    fireEvent.click(screen.getByText('chapter.deselectAll'));

    expect(onSelectedIdsChange).toHaveBeenCalledWith([]);
  });
});
