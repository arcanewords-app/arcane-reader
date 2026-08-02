// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicEntity } from '../../types.js';
import { TagChip } from './TagChip.js';

const tagEntity: PublicEntity = {
  id: 'tag-1',
  kind: 'tag',
  name: 'Fantasy',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('TagChip', () => {
  afterEach(() => {
    cleanup();
  });

  it('matches snapshot for default chip', () => {
    const { container } = render(<TagChip entity={tagEntity} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when selected', () => {
    const { container } = render(<TagChip entity={tagEntity} selected />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
