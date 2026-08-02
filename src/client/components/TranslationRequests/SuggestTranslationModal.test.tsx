// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../Project/ProjectLanguagePairFields.js', () => ({
  ProjectLanguagePairFields: () => <div data-testid="language-pair-fields" />,
}));

vi.mock('../../api/client.js', () => ({
  api: {
    createCatalogTranslationRequest: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    data?: unknown;
    constructor(message: string, data?: unknown) {
      super(message);
      this.data = data;
    }
  },
}));

import { api } from '../../api/client.js';
import { SuggestTranslationModal } from './SuggestTranslationModal.js';

describe('SuggestTranslationModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders form fields when open', () => {
    render(<SuggestTranslationModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('translationRequests.modalTitle')).toBeTruthy();
    expect(screen.getByTestId('language-pair-fields')).toBeTruthy();
    expect(screen.getByPlaceholderText('translationRequests.form.titlePlaceholder')).toBeTruthy();
  });

  it('shows validation error for short title', () => {
    render(<SuggestTranslationModal isOpen onClose={vi.fn()} />);

    fireEvent.input(screen.getByPlaceholderText('translationRequests.form.titlePlaceholder'), {
      target: { value: 'A' },
    });
    fireEvent.click(screen.getByText('translationRequests.submit'));

    expect(screen.getByText('translationRequests.errors.titleRequired')).toBeTruthy();
  });

  it('submits request and shows success flash', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    vi.mocked(api.createCatalogTranslationRequest).mockResolvedValue(undefined as never);

    render(<SuggestTranslationModal isOpen onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.input(screen.getByPlaceholderText('translationRequests.form.titlePlaceholder'), {
      target: { value: 'Suggested Book' },
    });
    fireEvent.click(screen.getByText('translationRequests.submit'));

    await waitFor(() => {
      expect(api.createCatalogTranslationRequest).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Suggested Book' })
      );
      expect(onSuccess).toHaveBeenCalled();
      expect(screen.getByText('translationRequests.created')).toBeTruthy();
    });

    await waitFor(
      () => {
        expect(onClose).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );
  });
});
