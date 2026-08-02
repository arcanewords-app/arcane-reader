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
      id: 'ent-1',
      name: 'Author Name',
      description: 'Bio text',
    } as never);

    render(<EntityChip display="Author Name" entityId="ent-1" routeParam="author" />);
    const wrapper = screen
      .getByRole('button', { name: 'Author Name' })
      .closest('.entity-chip-wrapper')!;
    fireEvent.mouseEnter(wrapper);

    await waitFor(() => {
      expect(api.getPublicEntityById).toHaveBeenCalledWith('ent-1');
    });
    expect(screen.getByRole('tooltip').textContent).toContain('Bio text');
  });

  it('does not fetch on hover when entity prop is provided', async () => {
    render(
      <EntityChip
        display="Author Name"
        entityId="ent-1"
        routeParam="author"
        entity={{ id: 'ent-1', name: 'Author Name', description: 'Prefetched bio' } as never}
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
});
