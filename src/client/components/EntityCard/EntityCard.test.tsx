// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicEntity } from '../../types.js';
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
  });

  it('matches snapshot for compact placeholder entity', () => {
    const { container } = render(<EntityCard entity={fixtureEntity} compact />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
