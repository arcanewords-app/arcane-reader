// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserListItem } from '../types.js';

const mocks = vi.hoisted(() => ({
  getAdminUsers: vi.fn(),
  updateAdminUserRole: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('../api/client.js', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    data?: unknown;
    constructor(message: string, status: number, data?: unknown) {
      super(message);
      this.status = status;
      this.data = data;
    }
  },
  api: {
    getAdminUsers: mocks.getAdminUsers,
    updateAdminUserRole: mocks.updateAdminUserRole,
  },
}));

import { AdminUsersPage } from './AdminUsersPage.js';

function makeUser(overrides: Partial<AdminUserListItem> = {}): AdminUserListItem {
  return {
    id: 'u1',
    email: 'user@example.com',
    role: 'user',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('AdminUsersPage', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders page intro and user list from API', async () => {
    mocks.getAdminUsers.mockResolvedValue([makeUser()]);
    render(<AdminUsersPage />);

    expect(screen.getByText('admin.users.subtitle')).toBeTruthy();
    expect(screen.getByText('admin.users.listTitle')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('user@example.com')).toBeTruthy();
      expect(screen.getByText('admin.users.changeRole')).toBeTruthy();
    });
  });

  it('shows empty state when API returns no users', async () => {
    mocks.getAdminUsers.mockResolvedValue([]);
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText('admin.users.empty')).toBeTruthy();
    });
  });
});
