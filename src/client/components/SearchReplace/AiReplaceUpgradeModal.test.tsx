// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../hooks/useUserRole.js', () => ({
  useUserRole: () => ({
    user: { id: 'u1', email: 'a@example.com', role: 'author' },
    role: 'author',
    isGuest: false,
    isAtLeast: () => true,
    refresh: vi.fn(),
  }),
}));

vi.mock('../UpgradeRequest', () => ({
  UpgradeRequestActions: () => <div data-testid="upgrade-actions" />,
}));

import { AiReplaceUpgradeModal } from './AiReplaceUpgradeModal.js';

describe('AiReplaceUpgradeModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders title and message when open', () => {
    render(<AiReplaceUpgradeModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText('searchReplace.upgrade.title')).toBeTruthy();
    expect(screen.getByText('searchReplace.upgrade.message')).toBeTruthy();
    expect(document.querySelector('.modal-overlay')).toBeTruthy();
    expect(screen.getByTestId('upgrade-actions')).toBeTruthy();
  });

  it('does not render when closed', () => {
    render(<AiReplaceUpgradeModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('searchReplace.upgrade.title')).toBeNull();
  });
});
