// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAtLeast: vi.fn((role: string) => role === 'author' || role === 'admin'),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'ru' },
  }),
}));

vi.mock('../i18n.js', () => ({
  setSavedLocale: vi.fn(),
  SUPPORTED_LOCALES: ['ru', 'en', 'be', 'pl'],
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/useUserRole.js', () => ({
  useUserRole: () => ({
    isAtLeast: (role: string) => mocks.isAtLeast(role),
  }),
}));

vi.mock('./TokenUsage', () => ({
  TokenUsageIndicator: () => <div data-testid="token-usage" />,
}));

vi.mock('./Header/SupportMenu.js', () => ({
  SupportMenu: () => <div data-testid="support-menu" />,
}));

import { Header } from './Header.js';

describe('Header', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.isAtLeast.mockImplementation((role: string) => role === 'author' || role === 'admin');
  });

  it('shows login and register buttons for guests', () => {
    render(<Header onOpenLogin={vi.fn()} onOpenRegister={vi.fn()} />);

    expect(screen.getByText('header.login')).toBeTruthy();
    expect(screen.getByText('header.register')).toBeTruthy();
    expect(screen.queryByText('nav.projects')).toBeNull();
    expect(screen.getByTestId('support-menu')).toBeTruthy();
  });

  it('shows author navigation and logout when logged in', () => {
    render(
      <Header user={{ id: 'u1', email: 'author@example.com', role: 'author' }} onLogout={vi.fn()} />
    );

    expect(screen.getByText('nav.catalog')).toBeTruthy();
    expect(screen.getByText('nav.projects')).toBeTruthy();
    expect(screen.getByText('nav.requests')).toBeTruthy();
    expect(screen.getByText('header.logout')).toBeTruthy();
    expect(screen.queryByText('header.login')).toBeNull();
  });

  it('shows admin navigation link for admins', () => {
    mocks.isAtLeast.mockImplementation(() => true);

    render(
      <Header user={{ id: 'u1', email: 'admin@example.com', role: 'admin' }} onLogout={vi.fn()} />
    );

    expect(screen.getByText('nav.admin')).toBeTruthy();
  });

  it('opens login modal handler from guest auth button', () => {
    const onOpenLogin = vi.fn();
    render(<Header onOpenLogin={onOpenLogin} onOpenRegister={vi.fn()} />);

    fireEvent.click(screen.getByText('header.login'));
    expect(onOpenLogin).toHaveBeenCalledTimes(1);
  });
});
