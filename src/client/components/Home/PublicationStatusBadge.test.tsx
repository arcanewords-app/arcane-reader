// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { PublicationStatusBadge } from './PublicationStatusBadge.js';

describe('PublicationStatusBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders complete status', () => {
    const { container } = render(<PublicationStatusBadge status="complete" />);
    expect(screen.getByText('publication.statusBadge.complete')).toBeTruthy();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders in_progress status', () => {
    render(<PublicationStatusBadge status="in_progress" />);
    expect(screen.getByText('publication.statusBadge.inProgress')).toBeTruthy();
    expect(screen.getByLabelText('publication.statusBadgeAria.inProgress')).toBeTruthy();
  });
});
