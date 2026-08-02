// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminFlash } from './AdminFlash';

describe('AdminFlash', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders error message when error is set', () => {
    render(<AdminFlash error="Something failed" />);
    const el = screen.getByText('Something failed');
    expect(el.classList.contains('admin-flash--error')).toBe(true);
  });

  it('renders success message when success is set', () => {
    render(<AdminFlash success="Saved successfully" />);
    const el = screen.getByText('Saved successfully');
    expect(el.classList.contains('admin-flash--success')).toBe(true);
  });

  it('renders nothing when both are absent', () => {
    const { container } = render(<AdminFlash />);
    expect(container.textContent).toBe('');
  });
});
