// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { email?: string }) => (opts?.email ? `${key}:${opts.email}` : key),
  }),
}));

import { EmailConfirmationModal } from './EmailConfirmationModal';

describe('EmailConfirmationModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders confirmation content when open', () => {
    render(<EmailConfirmationModal isOpen email="user@example.com" onClose={vi.fn()} />);
    expect(screen.getByText('auth.confirmEmailTitle')).toBeTruthy();
    expect(screen.getByText('auth.confirmEmailMessage:user@example.com')).toBeTruthy();
    expect(document.querySelector('.modal-overlay')).toBeTruthy();
  });

  it('does not render when closed', () => {
    render(<EmailConfirmationModal isOpen={false} email="user@example.com" onClose={vi.fn()} />);
    expect(screen.queryByText('auth.confirmEmailTitle')).toBeNull();
  });

  it('calls onClose when OK is clicked', () => {
    const onClose = vi.fn();
    render(<EmailConfirmationModal isOpen email="user@example.com" onClose={onClose} />);
    fireEvent.click(screen.getByText('common.ok'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
