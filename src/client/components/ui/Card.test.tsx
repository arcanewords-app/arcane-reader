// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from './Card.js';

describe('Card', () => {
  afterEach(() => {
    cleanup();
  });

  it('matches snapshot with title and children', () => {
    const { container } = render(
      <Card title="Chapter">
        <p>Body text</p>
      </Card>
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
