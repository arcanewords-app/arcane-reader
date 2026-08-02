// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton.js';

describe('Skeleton', () => {
  afterEach(() => {
    cleanup();
  });

  it('matches snapshot for block skeleton', () => {
    const { container } = render(<Skeleton variant="block" width={120} height={24} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
