// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../../hooks/useUserRole.js', () => ({
  useUserRole: vi.fn(),
}));

vi.mock('../AccountTiers', () => ({
  RoleComparisonTable: () => <div data-testid="role-table" />,
}));

vi.mock('../UpgradeRequest', () => ({
  UpgradeRequestActions: () => <div data-testid="upgrade-actions" />,
}));

import { useUserRole } from '../../hooks/useUserRole.js';
import { UpgradeScreen } from './UpgradeScreen.js';

describe('UpgradeScreen', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders title, message, and CTA buttons', () => {
    vi.mocked(useUserRole).mockReturnValue({
      user: { id: 'u1', email: 'u@example.com', role: 'user' },
      role: 'user',
      isGuest: false,
      isAtLeast: () => false,
      refresh: vi.fn(),
    });

    render(<UpgradeScreen />);

    expect(screen.getByText('auth.upgradeTitle')).toBeTruthy();
    expect(screen.getByText('auth.upgradeMessage')).toBeTruthy();
    expect(screen.getByTestId('role-table')).toBeTruthy();
    expect(screen.getByTestId('upgrade-actions')).toBeTruthy();
    expect(screen.getByText('auth.upgradeLearnMore')).toBeTruthy();
    expect(screen.getByText('auth.upgradeGoToCatalog')).toBeTruthy();
    expect(screen.getByText('auth.upgradeGoToProfile')).toBeTruthy();
  });
});
