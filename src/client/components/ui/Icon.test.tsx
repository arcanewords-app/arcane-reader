// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon } from './Icon.js';

describe('Icon', () => {
  afterEach(() => {
    cleanup();
  });

  it('matches snapshot for a known glyph', () => {
    const { container } = render(<Icon name="check_circle" size="sm" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
