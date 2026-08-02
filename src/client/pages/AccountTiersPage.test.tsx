// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/useUserRole.js', () => ({
  useUserRole: () => ({
    user: { id: 'u1', email: 'a@example.com', role: 'user' },
    role: 'user',
    isGuest: false,
    isAtLeast: () => false,
    refresh: vi.fn(),
  }),
}));

vi.mock('../hooks/useStaticPageMeta.js', () => ({
  useStaticPageMeta: vi.fn(),
}));

vi.mock('../components/AccountTiers', () => ({
  RoleComparisonTable: () => <div data-testid="role-comparison-table" />,
}));

vi.mock('../components/UpgradeRequest', () => ({
  UpgradeRequestActions: () => null,
}));

vi.mock('../services/authService.js', () => ({
  authService: { isAuthenticated: () => true },
}));

vi.mock('../components/ui', () => ({
  Button: ({ children, ...props }: { children?: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

import { AccountTiersPage } from './AccountTiersPage.js';

describe('AccountTiersPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders page title and role comparison table', () => {
    render(<AccountTiersPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      'tiers.pageTitle'
    );
    expect(screen.getByTestId('role-comparison-table')).toBeTruthy();
  });
});
