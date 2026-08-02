// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Suspense } from './Suspense.js';

describe('Suspense', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders children directly', () => {
    render(
      <Suspense fallback={<span>Loading fallback</span>}>
        <span>Loaded content</span>
      </Suspense>
    );

    expect(screen.getByText('Loaded content')).toBeTruthy();
    expect(screen.queryByText('Loading fallback')).toBeNull();
  });
});
