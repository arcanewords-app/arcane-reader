// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import { BookPlaceholder } from './BookPlaceholder.js';

describe('BookPlaceholder', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders book placeholder container and svg', () => {
    const { container } = render(<BookPlaceholder projectName="Alpha Book" projectType="book" />);

    expect(container.querySelector('.book-placeholder')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders text document variant for text type', () => {
    const { container } = render(<BookPlaceholder projectName="Notes Doc" projectType="text" />);

    expect(container.querySelector('.book-placeholder')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('produces deterministic markup for the same project name', () => {
    const { container: first } = render(
      <BookPlaceholder projectName="Stable Seed" projectType="book" />
    );
    const { container: second } = render(
      <BookPlaceholder projectName="Stable Seed" projectType="book" />
    );

    expect(first.innerHTML).toBe(second.innerHTML);
  });
});
