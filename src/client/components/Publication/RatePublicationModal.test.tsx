// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { RatePublicationModal } from './RatePublicationModal.js';

describe('RatePublicationModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(<RatePublicationModal isOpen onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('rating.rateTitle')).toBeTruthy();
    expect(document.querySelector('.modal-overlay')).toBeTruthy();
  });

  it('saves selected score', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<RatePublicationModal isOpen onClose={onClose} onSave={onSave} />);

    const stars = screen.getAllByRole('radio');
    fireEvent.click(stars[3]!);
    fireEvent.click(screen.getByText('rating.save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(4);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('removes rating when remove is available', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <RatePublicationModal
        isOpen
        onClose={onClose}
        onSave={vi.fn()}
        onRemove={onRemove}
        initialScore={3}
      />
    );

    fireEvent.click(screen.getByText('rating.remove'));

    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
