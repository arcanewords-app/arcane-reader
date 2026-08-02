// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

import { route } from 'preact-router';
import { AdminRedirect, AdminEntitiesRedirect } from './AdminRedirect.js';

describe('AdminRedirect', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('redirects /admin to default entities tag tab', () => {
    render(<AdminRedirect />);
    expect(route).toHaveBeenCalledWith('/admin/entities/tag', true);
  });

  it('redirects legacy /admin/entities to tag tab', () => {
    render(<AdminEntitiesRedirect />);
    expect(route).toHaveBeenCalledWith('/admin/entities/tag', true);
  });
});
