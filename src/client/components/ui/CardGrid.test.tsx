// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { CardGrid } from './CardGrid.js';

describe('CardGrid', () => {
  afterEach(() => {
    cleanup();
  });

  it('matches snapshot for publication variant', () => {
    const { container } = render(
      <CardGrid>
        <article>Card A</article>
        <article>Card B</article>
      </CardGrid>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('adds project modifier class', () => {
    const { container } = render(
      <CardGrid variant="project">
        <article>Project</article>
      </CardGrid>
    );
    expect((container.firstChild as HTMLElement).className).toContain('card-grid--project');
  });
});
