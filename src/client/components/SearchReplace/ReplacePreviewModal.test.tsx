// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { ReplacePreviewModal } from './ReplacePreviewModal.js';

const sampleItem = {
  paragraphId: 'p1',
  paragraphIndex: 1,
  before: 'Hello',
  after: 'Hi',
  find: 'Hello',
};

describe('ReplacePreviewModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('literal source shows preview hints and before/after text', () => {
    render(
      <ReplacePreviewModal
        isOpen
        onClose={vi.fn()}
        items={[sampleItem]}
        onConfirm={vi.fn()}
        isReplacing={false}
        source="literal"
      />
    );

    expect(screen.getByText('searchReplace.previewHint')).toBeTruthy();
    expect(screen.getByText('searchReplace.blockMarkerHint')).toBeTruthy();
    expect(screen.getByText(/searchReplace\.before/)).toBeTruthy();
    expect(screen.getByText(/searchReplace\.after/)).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Hi')).toBeTruthy();
  });

  it('ai source with sparse output shows aiPreviewCoverage', () => {
    render(
      <ReplacePreviewModal
        isOpen
        onClose={vi.fn()}
        items={[sampleItem]}
        onConfirm={vi.fn()}
        isReplacing={false}
        source="ai"
        selectedCount={5}
      />
    );

    expect(screen.getByText('searchReplace.aiPreviewCoverage')).toBeTruthy();
    expect(screen.queryByText('searchReplace.blockMarkerHint')).toBeNull();
  });

  it('shows progress label and bar while replacing', () => {
    render(
      <ReplacePreviewModal
        isOpen
        onClose={vi.fn()}
        items={[sampleItem]}
        onConfirm={vi.fn()}
        isReplacing
        progress={{ done: 1, total: 3 }}
      />
    );

    expect(screen.getByText('searchReplace.progress')).toBeTruthy();
    expect(document.querySelector('.replace-preview-progress-bar')).toBeTruthy();
  });

  it('confirm button calls onConfirm', () => {
    const onConfirm = vi.fn();
    render(
      <ReplacePreviewModal
        isOpen
        onClose={vi.fn()}
        items={[sampleItem]}
        onConfirm={onConfirm}
        isReplacing={false}
      />
    );

    fireEvent.click(screen.getByText('searchReplace.applyReplace'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
