// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal.js';

describe('Modal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
  });

  it('renders title and children when open', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Hello">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('does not render when closed', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Hello">
        <p>Body</p>
      </Modal>
    );
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Hello">
        <p>Body</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('matches snapshot for open shell', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Hello">
        <p>Body</p>
      </Modal>
    );
    expect(document.querySelector('.modal-overlay')).toMatchSnapshot();
  });
});
