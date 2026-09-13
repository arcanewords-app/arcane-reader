// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChapterUploadQueueItem } from './useChapterUploadQueue.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { UploadQueueModal } from './UploadQueueModal.js';

function makeItem(overrides: Partial<ChapterUploadQueueItem> = {}): ChapterUploadQueueItem {
  return {
    id: 'q1',
    file: new File(['chapter'], 'ch1.txt', { type: 'text/plain' }),
    title: 'ch1.txt',
    status: 'pending',
    retries: 0,
    ...overrides,
  };
}

function renderQueue(overrides: Partial<Parameters<typeof UploadQueueModal>[0]> = {}) {
  const onShowUploadModal = vi.fn();
  const onRetryItem = vi.fn();
  const onRemoveItem = vi.fn();
  render(
    <UploadQueueModal
      queue={[makeItem()]}
      processing={false}
      showUploadModal
      onShowUploadModal={onShowUploadModal}
      onCancelQueue={vi.fn()}
      onRetryItem={onRetryItem}
      onRemoveItem={onRemoveItem}
      {...overrides}
    />
  );
  return { onShowUploadModal, onRetryItem, onRemoveItem };
}

describe('UploadQueueModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders nothing when the queue is empty', () => {
    renderQueue({ queue: [] });
    expect(screen.queryByText('chapterList.uploadQueue')).toBeNull();
  });

  it('lists queued files in the modal', () => {
    renderQueue();
    expect(screen.getByText('ch1.txt')).toBeTruthy();
    expect(screen.getByText('common.close')).toBeTruthy();
  });

  it('retries and removes failed items', () => {
    const { onRetryItem, onRemoveItem } = renderQueue({
      queue: [makeItem({ status: 'error', error: 'boom' })],
    });
    expect(screen.getByText('boom')).toBeTruthy();
    fireEvent.click(screen.getByText('common.retry'));
    fireEvent.click(screen.getByText('common.remove'));
    expect(onRetryItem).toHaveBeenCalledWith('q1');
    expect(onRemoveItem).toHaveBeenCalledWith('q1');
  });
});
