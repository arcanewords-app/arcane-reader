// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { ConfirmModal } from './ConfirmModal';

describe('ConfirmModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('shows title and message when open', () => {
    render(
      <ConfirmModal
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete chapter"
        message="This cannot be undone."
      />
    );
    expect(screen.getByText('Delete chapter')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
  });

  it('calls onConfirm and onClose when confirm succeeds', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm"
        message="Proceed?"
      />
    );

    fireEvent.click(screen.getByText('common.ok'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps modal open when onConfirm returns false', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(false);

    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm"
        message="Proceed?"
      />
    );

    fireEvent.click(screen.getByText('common.ok'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Proceed?')).toBeTruthy();
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn();

    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Confirm"
        message="Proceed?"
      />
    );

    fireEvent.click(screen.getByText('common.cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
