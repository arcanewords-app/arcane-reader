/** @vitest-environment happy-dom */
import { renderHook, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getCachedUser = vi.fn();
const getCurrentUser = vi.fn();

vi.mock('../services/authService.js', () => ({
  AUTH_CHANGED_EVENT: 'arcane:auth-changed',
  USER_UPDATED_EVENT: 'arcane:user-updated',
  authService: {
    getCachedUser: (...args: unknown[]) => getCachedUser(...args),
    getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
  },
}));

import { useUserRole } from './useUserRole.js';

describe('useUserRole', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('treats missing cached user as guest until refresh resolves', async () => {
    getCachedUser.mockReturnValue(null);
    getCurrentUser.mockResolvedValue(null);

    const { result } = renderHook(() => useUserRole());

    expect(result.current.isGuest).toBe(true);
    expect(result.current.role).toBe('guest');
    expect(result.current.isAtLeast('user')).toBe(false);

    await waitFor(() => {
      expect(getCurrentUser).toHaveBeenCalled();
    });
  });

  it('exposes cached author role and isAtLeast hierarchy', async () => {
    getCachedUser.mockReturnValue({ id: 'u1', email: 'a@example.com', role: 'author' });
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@example.com', role: 'author' });

    const { result } = renderHook(() => useUserRole());

    expect(result.current.isGuest).toBe(false);
    expect(result.current.role).toBe('author');
    expect(result.current.isAtLeast('user')).toBe(true);
    expect(result.current.isAtLeast('author')).toBe(true);
    expect(result.current.isAtLeast('admin')).toBe(false);

    await waitFor(() => {
      expect(getCurrentUser).toHaveBeenCalled();
    });
  });
});
