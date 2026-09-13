// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicEntity } from '../types.js';

const mocks = vi.hoisted(() => ({
  getPublicEntities: vi.fn(),
  route: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: (...args: unknown[]) => mocks.route(...args),
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
    getPublicEntities: (...args: unknown[]) => mocks.getPublicEntities(...args),
  },
}));

import { AdminEntitiesPage } from './AdminEntitiesPage.js';

function makeEntity(overrides: Partial<PublicEntity> = {}): PublicEntity {
  return {
    id: 'e1',
    kind: 'tag',
    name: 'Fantasy',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('AdminEntitiesPage', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('redirects to tags when kind is missing', async () => {
    mocks.getPublicEntities.mockResolvedValue([]);
    render(<AdminEntitiesPage />);
    expect(mocks.route).toHaveBeenCalledWith('/admin/entities/tag', true);
    await waitFor(() => {
      expect(screen.getByText('admin.list.empty')).toBeTruthy();
    });
  });

  it('lists entities for the requested kind', async () => {
    mocks.getPublicEntities.mockResolvedValue([makeEntity()]);
    render(<AdminEntitiesPage kind="tag" />);

    expect(screen.getByText('admin.entities.intro.tag')).toBeTruthy();
    await waitFor(() => {
      expect(mocks.getPublicEntities).toHaveBeenCalled();
      expect(screen.getByText('Fantasy')).toBeTruthy();
    });
  });
});
