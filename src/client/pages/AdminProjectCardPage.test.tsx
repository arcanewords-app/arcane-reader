// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminProjectCard, PublicEntity } from '../types.js';

const mocks = vi.hoisted(() => ({
  getAdminProjectCard: vi.fn(),
  getPublicEntitiesByIds: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../hooks/useUserRole', () => ({
  useUserRole: () => ({
    user: { id: 'admin-1', role: 'admin' },
    role: 'admin',
    isGuest: false,
    isAtLeast: () => true,
    refresh: vi.fn(),
  }),
}));

vi.mock('../components/EntityCard/EntityPickerModal', () => ({
  EntityPickerModal: () => null,
}));

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, _data?: unknown, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  api: {
    getAdminProjectCard: (...args: unknown[]) => mocks.getAdminProjectCard(...args),
    getPublicEntitiesByIds: (...args: unknown[]) => mocks.getPublicEntitiesByIds(...args),
  },
}));

import { AdminProjectCardPage } from './AdminProjectCardPage.js';

const translator: PublicEntity = {
  id: 'tr-1',
  kind: 'translator',
  name: 'Kukutsapol',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function makeCard(): AdminProjectCard {
  return {
    id: 'proj-1',
    name: 'Arcane Book',
    userId: 'owner-1',
    ownerEmail: 'owner@example.com',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    originalTitle: 'Original',
    catalogTitle: 'Catalog title',
    description: 'A moderated description',
    coverImageUrl: null,
    sourceUrl: null,
    authorEntityId: null,
    translatorEntityId: 'tr-1',
    tagEntityIds: [],
    translationStatus: 'in_progress',
    publicationId: 'pub-1',
    publicationStatus: 'published',
    publicationSlug: 'arcane-book',
  };
}

describe('AdminProjectCardPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the description and translator and hides chapters', async () => {
    mocks.getAdminProjectCard.mockResolvedValue(makeCard());
    mocks.getPublicEntitiesByIds.mockResolvedValue([translator]);

    render(<AdminProjectCardPage projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('admin.projects.card.description')).toBeTruthy();
      expect(screen.getByText('Kukutsapol')).toBeTruthy();
    });
    expect(screen.getByText('admin.projects.card.translator')).toBeTruthy();
    expect(screen.queryByText('admin.projects.chapters')).toBeNull();
    expect(screen.queryByText('processChapters.filterAll')).toBeNull();
  });
});
