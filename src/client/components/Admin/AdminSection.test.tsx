// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSection } from './AdminSection.js';

describe('AdminSection', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title and children in a section', () => {
    render(
      <AdminSection title="Section title">
        <p>Child content</p>
      </AdminSection>
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveProperty(
      'textContent',
      'Section title'
    );
    expect(screen.getByText('Child content')).toBeTruthy();
    expect(document.querySelector('section.admin-section')).toBeTruthy();
  });

  it('renders as form when as="form"', () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    render(
      <AdminSection title="Form title" as="form" formId="test-form" onSubmit={onSubmit}>
        <button type="submit">Submit</button>
      </AdminSection>
    );

    const form = document.querySelector('form.admin-section') as HTMLFormElement;
    expect(form).toBeTruthy();
    expect(form.id).toBe('test-form');
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
