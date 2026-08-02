// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicEntity } from '../../types.js';

const apiMocks = vi.hoisted(() => ({
  getPublicEntities: vi.fn(),
  getTranslatorPseudonyms: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../api/client', () => ({
  api: {
    getPublicEntities: apiMocks.getPublicEntities,
    getTranslatorPseudonyms: apiMocks.getTranslatorPseudonyms,
  },
}));

vi.mock('../TranslatorPseudonym/TranslatorPseudonymsSection', () => ({
  TranslatorPseudonymFormModal: () => null,
}));

import { EntityPickerModal } from './EntityPickerModal.js';

const authorA: PublicEntity = {
  id: 'a1',
  kind: 'author',
  name: 'Author One',
  description: null,
  photoUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const tagA: PublicEntity = {
  id: 't1',
  kind: 'tag',
  name: 'Fantasy',
  description: null,
  photoUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const tagB: PublicEntity = {
  ...tagA,
  id: 't2',
  name: 'Romance',
};

describe('EntityPickerModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('loads and selects a single author', async () => {
    apiMocks.getPublicEntities.mockResolvedValue([authorA]);
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <EntityPickerModal isOpen onClose={onClose} kind="author" mode="single" onSelect={onSelect} />
    );

    expect(screen.getByText('entityPicker.titleAuthor')).toBeTruthy();
    const name = await screen.findByText('Author One', {}, { timeout: 3000 });
    fireEvent.click(name);
    expect(onSelect).toHaveBeenCalledWith([authorA]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirms multi-select tags', async () => {
    apiMocks.getPublicEntities.mockResolvedValue([tagA, tagB]);
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <EntityPickerModal isOpen onClose={onClose} kind="tag" mode="multi" onSelect={onSelect} />
    );

    await screen.findByText('Fantasy', {}, { timeout: 3000 });
    fireEvent.click(screen.getByText('Fantasy'));
    fireEvent.click(screen.getByText('entityPicker.confirm'));

    expect(onSelect).toHaveBeenCalledWith([tagA]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error when load fails', async () => {
    apiMocks.getPublicEntities.mockRejectedValue(new Error('network down'));

    render(
      <EntityPickerModal isOpen onClose={vi.fn()} kind="author" mode="single" onSelect={vi.fn()} />
    );

    await waitFor(
      () => {
        expect(screen.getByRole('alert').textContent).toBe('network down');
      },
      { timeout: 3000 }
    );
  });
});
