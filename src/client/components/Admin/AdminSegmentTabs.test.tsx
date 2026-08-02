// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

import { route } from 'preact-router';
import { AdminSegmentTabs } from './AdminSegmentTabs.js';

const tabs = [
  { id: 'tag', path: '/admin/entities/tag', label: 'Tags' },
  { id: 'author', path: '/admin/entities/author', label: 'Authors' },
];

describe('AdminSegmentTabs', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('marks active tab with aria-current', () => {
    render(<AdminSegmentTabs tabs={tabs} activeId="tag" ariaLabel="Entity tabs" />);

    const active = screen.getByText('Tags').closest('a');
    const inactive = screen.getByText('Authors').closest('a');
    expect(active?.getAttribute('aria-current')).toBe('page');
    expect(inactive?.getAttribute('aria-current')).toBeNull();
  });

  it('routes when a tab is clicked', () => {
    render(<AdminSegmentTabs tabs={tabs} activeId="tag" ariaLabel="Entity tabs" />);

    fireEvent.click(screen.getByText('Authors'));
    expect(route).toHaveBeenCalledWith('/admin/entities/author');
  });
});
