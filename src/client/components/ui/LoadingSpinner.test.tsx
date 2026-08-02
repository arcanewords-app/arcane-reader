// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingSpinner } from './LoadingSpinner.js';

describe('LoadingSpinner', () => {
  afterEach(() => {
    cleanup();
  });

  it('matches snapshot for default inline spinner', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
