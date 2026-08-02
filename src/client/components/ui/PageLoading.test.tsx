// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { PageLoading } from './PageLoading';

describe('PageLoading', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders full-page loading spinner', () => {
    const { container } = render(<PageLoading text="Loading data…" />);
    expect(container.querySelector('.page-loading')).toBeTruthy();
    expect(screen.getByText('Loading data…')).toBeTruthy();
  });
});
