// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button.js';

describe('Button', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders as a button with children', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('invokes onClick when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled or loading', () => {
    const { rerender } = render(<Button disabled>Off</Button>);
    expect(screen.getByRole('button', { name: 'Off' })).toHaveProperty('disabled', true);

    rerender(<Button loading>Load</Button>);
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });

  it('matches snapshot for primary button', () => {
    const { container } = render(<Button>Save</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when loading', () => {
    const { container } = render(<Button loading>Save</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
