// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireRole } from './RequireRole.js';

vi.mock('../../hooks/useUserRole.js', () => ({
  useUserRole: vi.fn(),
}));

import { useUserRole } from '../../hooks/useUserRole.js';

describe('RequireRole', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it('renders children when user meets minimum role', () => {
    vi.mocked(useUserRole).mockReturnValue({
      user: { id: 'u1', role: 'admin' },
      isAtLeast: (role: string) => role === 'author',
      loading: false,
    } as never);

    render(
      <RequireRole minRole="author">
        <span>Secret</span>
      </RequireRole>
    );

    expect(screen.getByText('Secret')).toBeTruthy();
  });

  it('renders fallback when role is insufficient', () => {
    vi.mocked(useUserRole).mockReturnValue({
      user: { id: 'u1', role: 'user' },
      isAtLeast: (role: string) => role === 'user',
      loading: false,
    } as never);

    render(
      <RequireRole minRole="author" fallback={<span>Denied</span>}>
        <span>Secret</span>
      </RequireRole>
    );

    expect(screen.getByText('Denied')).toBeTruthy();
    expect(screen.queryByText('Secret')).toBeNull();
  });
});
