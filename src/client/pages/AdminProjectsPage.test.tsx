// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminProjectListItem } from '../types.js';

const mocks = vi.hoisted(() => ({
  getAdminProjects: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  api: {
    getAdminProjects: (...args: unknown[]) => mocks.getAdminProjects(...args),
  },
}));

import { AdminProjectsPage } from './AdminProjectsPage.js';

function makeProject(overrides: Partial<AdminProjectListItem> = {}): AdminProjectListItem {
  return {
    id: 'p1',
    name: 'Arcane Book',
    userId: 'u1',
    ownerEmail: 'owner@example.com',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    chapterCount: 3,
    translatedCount: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    publicationId: null,
    publicationStatus: null,
    publicationTitle: null,
    publicationSlug: null,
    ...overrides,
  };
}

describe('AdminProjectsPage', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders page intro and empty state', async () => {
    mocks.getAdminProjects.mockResolvedValue([]);
    render(<AdminProjectsPage />);

    expect(screen.getByText('admin.projects.subtitle')).toBeTruthy();
    expect(screen.getByText('admin.projects.listTitle')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('admin.projects.empty')).toBeTruthy();
    });
  });

  it('lists admin projects from the API', async () => {
    mocks.getAdminProjects.mockResolvedValue([makeProject()]);
    render(<AdminProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText('Arcane Book')).toBeTruthy();
      expect(screen.getByText('admin.projects.copyId')).toBeTruthy();
    });
  });

  it('shows load error when the API fails', async () => {
    mocks.getAdminProjects.mockRejectedValue(new Error('boom'));
    render(<AdminProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText('admin.projects.loadFailed')).toBeTruthy();
    });
  });
});
