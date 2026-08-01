// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useUserRole.js', () => ({
  useUserRole: vi.fn(),
}));

// AuthorGate imports without .js; mock both forms for Vite/NodeNext
vi.mock('./UpgradeScreen', () => ({
  UpgradeScreen: () => 'Upgrade screen',
}));

vi.mock('../ui', () => ({
  LoadingSpinner: () => 'Loading',
}));

import { useUserRole } from '../../hooks/useUserRole.js';
import { AuthorGate } from './AuthorGate.js';

function DummyPage() {
  return <span>Author content</span>;
}

describe('AuthorGate', () => {
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

    const { container } = render(<AuthorGate path="/projects" component={DummyPage} />);
    expect(container.querySelector('.page-loading')).toBeTruthy();
    expect(screen.queryByText('Author content')).toBeNull();
  });

  it('renders UpgradeScreen when authenticated user is below author', () => {
    vi.mocked(useUserRole).mockReturnValue({
      user: { id: 'u1', email: 'u@example.com', role: 'user' },
      role: 'user',
      isGuest: false,
      isAtLeast: () => false,
      refresh: vi.fn(),
    });

    render(<AuthorGate path="/projects" component={DummyPage} />);
    expect(screen.queryByText('Author content')).toBeNull();
    expect(screen.getByText('Upgrade screen')).toBeTruthy();
  });

  it('renders component when user meets author role', () => {
    vi.mocked(useUserRole).mockReturnValue({
      user: { id: 'u1', email: 'a@example.com', role: 'author' },
      role: 'author',
      isGuest: false,
      isAtLeast: (role: string) => role === 'author' || role === 'user',
      refresh: vi.fn(),
    });

    render(<AuthorGate path="/projects" component={DummyPage} />);
    expect(screen.getByText('Author content')).toBeTruthy();
  });
});
