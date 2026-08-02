// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

import { route } from 'preact-router';
import { AdminLayout } from './AdminLayout';

describe('AdminLayout', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders title, nav tabs, and children', () => {
    render(
      <AdminLayout activeTab="news">
        <p>Child content</p>
      </AdminLayout>
    );

    expect(screen.getByText('admin.title')).toBeTruthy();
    expect(screen.getByText('Child content')).toBeTruthy();
    expect(screen.getByText('admin.tabs.entities')).toBeTruthy();
    expect(screen.getByText('admin.tabs.news')).toBeTruthy();
    expect(screen.getByText('admin.tabs.publications')).toBeTruthy();
    expect(screen.getByText('admin.tabs.projects')).toBeTruthy();
    expect(screen.getByText('admin.tabs.users')).toBeTruthy();
  });

  it('marks active tab with aria-current', () => {
    render(
      <AdminLayout activeTab="users">
        <span>Panel</span>
      </AdminLayout>
    );

    const usersTab = screen.getByText('admin.tabs.users').closest('a');
    expect(usersTab?.getAttribute('aria-current')).toBe('page');
    expect(
      screen.getByText('admin.tabs.news').closest('a')?.getAttribute('aria-current')
    ).toBeNull();
  });

  it('routes when a tab is clicked', () => {
    render(
      <AdminLayout activeTab="entities">
        <span>Panel</span>
      </AdminLayout>
    );

    fireEvent.click(screen.getByText('admin.tabs.projects'));
    expect(route).toHaveBeenCalledWith('/admin/projects');
  });
});
