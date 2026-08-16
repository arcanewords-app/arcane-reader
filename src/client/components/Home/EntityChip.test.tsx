// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../api/client.js', () => ({
  api: {
    getPublicEntityById: vi.fn(),
  },
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

import { api } from '../../api/client.js';
import { route } from 'preact-router';
import { buildCatalogEntityFilterUrl } from '../../utils/catalogRoutes.js';
import { EntityChip } from './EntityChip.js';

const entityBase = {
  id: 'ent-1',
  kind: 'author' as const,
  name: 'Author Name',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('EntityChip', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders static span when entityId is missing', () => {
    render(<EntityChip display="Anonymous" entityId={null} routeParam="author" />);
    expect(screen.getByText('Anonymous')).toBeTruthy();
    expect(document.querySelector('.publication-card-chip--static')).toBeTruthy();
    expect(document.querySelector('button')).toBeNull();
  });

  it('routes on click when entityId is set', () => {
    render(<EntityChip display="Author Name" entityId="ent-1" routeParam="author" />);
    fireEvent.click(screen.getByRole('button', { name: 'Author Name' }));
    expect(route).toHaveBeenCalledWith(buildCatalogEntityFilterUrl('author', 'ent-1'));
  });

  it('fetches entity on hover when entity prop is not provided', async () => {
    vi.mocked(api.getPublicEntityById).mockResolvedValue({
      ...entityBase,
      description: 'Bio text',
    });

    render(<EntityChip display="Author Name" entityId="ent-1" routeParam="author" />);
    const wrapper = screen
      .getByRole('button', { name: 'Author Name' })
      .closest('.entity-chip-wrapper')!;
    fireEvent.mouseEnter(wrapper);

    await waitFor(() => {
      expect(api.getPublicEntityById).toHaveBeenCalledWith('ent-1');
    });
    expect(screen.getByRole('tooltip').textContent).toContain('Bio text');
    expect(screen.getByRole('tooltip').textContent).toContain('Author Name');
  });

  it('does not fetch on hover when entity prop is provided', async () => {
    render(
      <EntityChip
        display="Author Name"
        entityId="ent-1"
        routeParam="author"
        entity={{ ...entityBase, description: 'Prefetched bio' }}
      />
    );
    const wrapper = screen
      .getByRole('button', { name: 'Author Name' })
      .closest('.entity-chip-wrapper')!;
    fireEvent.mouseEnter(wrapper);

    await waitFor(() => {
      expect(screen.getByRole('tooltip').textContent).toContain('Prefetched bio');
    });
    expect(api.getPublicEntityById).not.toHaveBeenCalled();
  });

  it('shows photo in preview when photoUrl is set', async () => {
    render(
      <EntityChip
        display="Author Name"
        entityId="ent-1"
        routeParam="author"
        entity={{ ...entityBase, photoUrl: 'https://cdn.example/a.jpg' }}
      />
    );
    const wrapper = screen
      .getByRole('button', { name: 'Author Name' })
      .closest('.entity-chip-wrapper')!;
    fireEvent.mouseEnter(wrapper);

    await waitFor(() => {
      const img = document.querySelector('.card-content-popup__photo') as HTMLImageElement | null;
      expect(img?.src).toContain('cdn.example/a.jpg');
    });
  });

  it('shows letter placeholder when description exists without photo', async () => {
    render(
      <EntityChip
        display="Author Name"
        entityId="ent-1"
        routeParam="author"
        entity={{ ...entityBase, description: 'Only bio' }}
      />
    );
    const wrapper = screen
      .getByRole('button', { name: 'Author Name' })
      .closest('.entity-chip-wrapper')!;
    fireEvent.mouseEnter(wrapper);

    await waitFor(() => {
      expect(document.querySelector('.card-content-popup__placeholder')?.textContent).toBe('A');
    });
  });

  it('does not show popup when entity has neither photo nor description', () => {
    render(
      <EntityChip
        display="Author Name"
        entityId="ent-1"
        routeParam="author"
        entity={{ ...entityBase }}
      />
    );
    const wrapper = screen
      .getByRole('button', { name: 'Author Name' })
      .closest('.entity-chip-wrapper')!;
    fireEvent.mouseEnter(wrapper);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
