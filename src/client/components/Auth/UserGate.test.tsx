// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useUserRole.js', () => ({
  useUserRole: vi.fn(),
}));

vi.mock('../ui', () => ({
  LoadingSpinner: () => 'Loading',
}));

import { useUserRole } from '../../hooks/useUserRole.js';
import { UserGate } from './UserGate.js';

function DummyPage() {
  return <span>User content</span>;
}

describe('UserGate', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows loading when user is not loaded', () => {
    vi.mocked(useUserRole).mockReturnValue({
      user: null,
      role: 'guest',
      isGuest: true,
      isAtLeast: () => false,
      refresh: vi.fn(),
    });

    const { container } = render(<UserGate path="/profile" component={DummyPage} />);
    expect(container.querySelector('.page-loading')).toBeTruthy();
    expect(screen.queryByText('User content')).toBeNull();
  });

  it('renders component when user is authenticated', () => {
    vi.mocked(useUserRole).mockReturnValue({
      user: { id: 'u1', email: 'u@example.com', role: 'user' },
      role: 'user',
      isGuest: false,
      isAtLeast: () => true,
      refresh: vi.fn(),
    });

    render(<UserGate path="/profile" component={DummyPage} />);
    expect(screen.getByText('User content')).toBeTruthy();
  });
});
