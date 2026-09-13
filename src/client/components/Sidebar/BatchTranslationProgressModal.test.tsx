// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BatchProgress } from '../../hooks/useBatchChapterTranslation.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { BatchTranslationProgressModal } from './BatchTranslationProgressModal.js';

function makeProgress(overrides: Partial<BatchProgress> = {}): BatchProgress {
  return {
    mode: 'translate',
    current: 1,
    total: 3,
    currentChapter: 'Chapter One',
    currentChapterId: 'ch1',
    chapters: [],
    totalTokens: 0,
    totalDuration: 0,
    totalGlossaryEntries: 0,
    completed: 0,
    errors: 0,
    skipped: 0,
    ...overrides,
  };
}

describe('BatchTranslationProgressModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('does not show progress content when idle', () => {
    render(
      <BatchTranslationProgressModal progress={null} cancelling={false} onClose={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.queryByText('projectInfo.translationProgressTitle')).toBeNull();
  });

  it('shows running progress and cancel', () => {
    const onCancel = vi.fn();
    render(
      <BatchTranslationProgressModal
        progress={makeProgress()}
        cancelling={false}
        onClose={vi.fn()}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText('projectInfo.translationProgressTitle')).toBeTruthy();
    expect(screen.getByText('Chapter One')).toBeTruthy();
    fireEvent.click(screen.getByText('chapter.cancelTranslate'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes when the batch is complete', () => {
    const onClose = vi.fn();
    render(
      <BatchTranslationProgressModal
        progress={makeProgress({ current: 3, total: 3, currentChapter: null })}
        cancelling={false}
        onClose={onClose}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('common.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
