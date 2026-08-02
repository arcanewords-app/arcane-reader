// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicEntity } from '../../types.js';

const mocks = vi.hoisted(() => ({
  getTranslatorPseudonyms: vi.fn(),
  createTranslatorPseudonym: vi.fn(),
  updateTranslatorPseudonym: vi.fn(),
  hideTranslatorPseudonym: vi.fn(),
}));

const t = vi.hoisted(() => (key: string, opts?: Record<string, unknown>) => {
  if (key === 'translatorPseudonym.counter' && opts) {
    return `counter:${opts.count}/${opts.max}`;
  }
  return key;
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t }),
}));

vi.mock('../../api/client.js', () => ({
  ApiError: class ApiError extends Error {
    code?: string;
  },
  api: {
    getTranslatorPseudonyms: (...args: unknown[]) => mocks.getTranslatorPseudonyms(...args),
    createTranslatorPseudonym: (...args: unknown[]) => mocks.createTranslatorPseudonym(...args),
    updateTranslatorPseudonym: (...args: unknown[]) => mocks.updateTranslatorPseudonym(...args),
    hideTranslatorPseudonym: (...args: unknown[]) => mocks.hideTranslatorPseudonym(...args),
  },
}));

vi.mock('../EntityCard/EntityCard.js', () => ({
  EntityCard: ({ entity }: { entity: { name: string } }) => (
    <div data-testid={`entity-${entity.name}`}>{entity.name}</div>
  ),
}));

vi.mock('../Admin/AdminEntityFormFields.js', () => ({
  AdminEntityFormFields: ({
    name,
    onNameChange,
  }: {
    name: string;
    onNameChange: (value: string) => void;
  }) => (
    <input
      aria-label="pseudonym-name"
      value={name}
      onInput={(e) => onNameChange((e.target as HTMLInputElement).value)}
    />
  ),
}));

import { TranslatorPseudonymsSection } from './TranslatorPseudonymsSection.js';

const activeEntity: PublicEntity = {
  id: 'e1',
  kind: 'translator',
  name: 'Pen Name',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  entityStatus: 'active',
};

describe('TranslatorPseudonymsSection', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('loads and lists active pseudonyms', async () => {
    mocks.getTranslatorPseudonyms.mockResolvedValue([activeEntity]);

    render(<TranslatorPseudonymsSection />);

    await waitFor(() => {
      expect(screen.getByText('Pen Name')).toBeTruthy();
      expect(screen.getByText('counter:1/3')).toBeTruthy();
    });
  });

  it('shows empty state when there are no pseudonyms', async () => {
    mocks.getTranslatorPseudonyms.mockResolvedValue([]);

    render(<TranslatorPseudonymsSection />);

    await waitFor(() => {
      expect(screen.getByText('translatorPseudonym.empty')).toBeTruthy();
    });
  });

  it('creates a new pseudonym from the form modal', async () => {
    mocks.getTranslatorPseudonyms
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...activeEntity, name: 'New Pen' }]);
    mocks.createTranslatorPseudonym.mockResolvedValue({ ...activeEntity, name: 'New Pen' });

    render(<TranslatorPseudonymsSection />);

    await waitFor(() => {
      expect(screen.getByText('translatorPseudonym.empty')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('translatorPseudonym.create'));
    expect(screen.getByText('translatorPseudonym.createTitle')).toBeTruthy();

    fireEvent.input(screen.getByLabelText('pseudonym-name'), {
      target: { value: 'New Pen' },
    });
    fireEvent.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(mocks.createTranslatorPseudonym).toHaveBeenCalledWith({
        name: 'New Pen',
        description: undefined,
        photo: undefined,
      });
      expect(screen.getByText('New Pen')).toBeTruthy();
    });
  });

  it('opens edit form for an existing pseudonym', async () => {
    mocks.getTranslatorPseudonyms.mockResolvedValue([activeEntity]);

    render(<TranslatorPseudonymsSection />);

    await waitFor(() => {
      expect(screen.getByText('Pen Name')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('translatorPseudonym.edit'));
    expect(screen.getByText('translatorPseudonym.editTitle')).toBeTruthy();
    expect(screen.getByLabelText('pseudonym-name')).toHaveProperty('value', 'Pen Name');
  });

  it('hides a pseudonym after confirmation', async () => {
    mocks.getTranslatorPseudonyms.mockResolvedValueOnce([activeEntity]).mockResolvedValueOnce([]);
    mocks.hideTranslatorPseudonym.mockResolvedValue(undefined);

    render(<TranslatorPseudonymsSection />);

    await waitFor(() => {
      expect(screen.getByText('Pen Name')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('translatorPseudonym.hide'));
    expect(screen.getByText('translatorPseudonym.hideConfirm')).toBeTruthy();
    fireEvent.click(document.querySelector('.btn-destructive') as HTMLButtonElement);

    await waitFor(() => {
      expect(mocks.hideTranslatorPseudonym).toHaveBeenCalledWith('e1');
      expect(screen.getByText('translatorPseudonym.empty')).toBeTruthy();
    });
  });
});
