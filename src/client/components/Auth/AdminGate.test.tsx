// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminGate } from './AdminGate.js';

vi.mock('../../hooks/useUserRole.js', () => ({
  useUserRole: vi.fn(),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

import { useUserRole } from '../../hooks/useUserRole.js';

function DummyPage() {
  return <span>Admin content</span>;
}

describe('AdminGate', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows loading spinner when user is not loaded', () => {
    vi.mocked(useUserRole).mockReturnValue({
      user: null,
      role: 'guest',
      isGuest: true,
      isAtLeast: () => false,
      refresh: vi.fn(),
    });

    const { container } = render(<AdminGate path="/admin" component={DummyPage} />);
    expect(container.querySelector('.page-loading')).toBeTruthy();
  });

  it('renders denied message when user is not admin', () => {
    vi.mocked(useUserRole).mockReturnValue({
      user: { id: 'u1', email: 'a@example.com', role: 'author' },
      role: 'author',
      isGuest: false,
      isAtLeast: () => false,
      refresh: vi.fn(),
    });

    render(<AdminGate path="/admin" component={DummyPage} />);
    expect(screen.queryByText('Admin content')).toBeNull();
    expect(screen.getByText('admin.deniedTitle')).toBeTruthy();
  });

  it('renders component when user is admin', () => {
    vi.mocked(useUserRole).mockReturnValue({
      user: { id: 'u1', email: 'admin@example.com', role: 'admin' },
      role: 'admin',
      isGuest: false,
      isAtLeast: () => true,
      refresh: vi.fn(),
    });

    render(<AdminGate path="/admin" component={DummyPage} />);
    expect(screen.getByText('Admin content')).toBeTruthy();
  });
});
