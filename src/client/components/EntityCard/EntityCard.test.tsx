// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicEntity } from '../../types.js';

vi.mock('../../hooks/useIsTruncated.js', () => ({
  useIsTruncated: vi.fn(() => false),
}));

import { useIsTruncated } from '../../hooks/useIsTruncated.js';
import { EntityCard } from './EntityCard.js';

const fixtureEntity: PublicEntity = {
  id: 'ent-1',
  kind: 'author',
  name: 'Ada Lovelace',
  description: 'Fixed fixture description',
  photoUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('EntityCard', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useIsTruncated).mockReturnValue(false);
  });

  it('matches snapshot for compact placeholder entity', () => {
    const { container } = render(<EntityCard entity={fixtureEntity} compact />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('opens the shared entity preview on hover', () => {
    const { container } = render(<EntityCard entity={fixtureEntity} compact />);
    fireEvent.mouseEnter(container.querySelector('.entity-card')!);

    const tip = document.querySelector('.card-content-popup--entity');
    expect(tip?.classList.contains('card-content-popup--fixed')).toBe(true);
    expect(tip?.textContent).toContain('Fixed fixture description');
    expect(tip?.textContent).toContain('Ada Lovelace');
    expect(tip?.querySelector('.card-content-popup__placeholder')?.textContent).toBe('A');
    expect(document.querySelector('.entity-card .card-content-popup')).toBeNull();
    expect(tip?.classList.contains('is-truncated')).toBe(false);
  });

  it('marks a long bio as truncated', () => {
    vi.mocked(useIsTruncated).mockReturnValue(true);
    const { container } = render(<EntityCard entity={fixtureEntity} compact />);
    fireEvent.mouseEnter(container.querySelector('.entity-card')!);
    expect(document.querySelector('.card-content-popup--entity.is-truncated')).toBeTruthy();
  });

  it('does not open a preview without a bio', () => {
    const { container } = render(
      <EntityCard entity={{ ...fixtureEntity, description: '  ' }} compact />
    );
    fireEvent.mouseEnter(container.querySelector('.entity-card')!);
    expect(document.querySelector('.card-content-popup')).toBeNull();
  });

  it('portals the preview into the open modal overlay', () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    render(<EntityCard entity={fixtureEntity} compact />, { container: overlay });
    fireEvent.mouseEnter(overlay.querySelector('.entity-card')!);
    expect(overlay.querySelector('.card-content-popup--fixed')).toBeTruthy();
    expect(document.body.querySelector(':scope > .card-content-popup')).toBeNull();
    overlay.remove();
  });
});
