// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardTranslationRequest } from '../types.js';

const mocks = vi.hoisted(() => ({
  getTranslationRequestsBoard: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/useUserRole.js', () => ({
  useUserRole: () => ({
    user: { id: 'u1', email: 'reader@example.com', role: 'user' },
    role: 'user',
    isGuest: false,
    isAtLeast: () => false,
    refresh: vi.fn(),
  }),
}));

vi.mock('../components/EntityCard/EntityPickerModal.js', () => ({
  EntityPickerModal: () => null,
}));

vi.mock('../components/TranslationRequests/SuggestTranslationModal.js', () => ({
  SuggestTranslationModal: () => null,
}));

vi.mock('../components/Project/ProjectLanguagePairFields.js', () => ({
  ProjectLanguagePairFields: () => null,
}));

vi.mock('../api/client.js', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  api: {
    getTranslationRequestsBoard: (...args: unknown[]) => mocks.getTranslationRequestsBoard(...args),
  },
}));

import { TranslationRequestsPage } from './TranslationRequestsPage.js';

function makeRequest(overrides: Partial<BoardTranslationRequest> = {}): BoardTranslationRequest {
  return {
    id: 'req-1',
    title: 'Translate This Novel',
    authorName: 'Original Author',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    comment: 'Please translate',
    sourceUrl: null,
    status: 'pending',
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
    interestCount: 0,
    interests: [],
    myInterest: null,
    ...overrides,
  };
}

describe('TranslationRequestsPage', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('shows loading then request board list from API', async () => {
    mocks.getTranslationRequestsBoard.mockResolvedValue([makeRequest()]);
    render(<TranslationRequestsPage />);

    expect(screen.getByText('requestBoard.loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveProperty(
        'textContent',
        'requestBoard.title'
      );
      expect(screen.getByText('Translate This Novel')).toBeTruthy();
      expect(screen.getByText('Please translate')).toBeTruthy();
    });
  });

  it('shows empty state when API returns no requests', async () => {
    mocks.getTranslationRequestsBoard.mockResolvedValue([]);
    render(<TranslationRequestsPage />);

    await waitFor(() => {
      expect(screen.getByText('requestBoard.emptyList')).toBeTruthy();
    });
  });
});
