// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { avg?: string; count?: number }) =>
      opts ? `${key}:${opts.avg}:${opts.count}` : key,
  }),
}));

import { PublicationRatingCoverBadge } from './PublicationRatingCoverBadge';

describe('PublicationRatingCoverBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders null when rating count is below display threshold', () => {
    const { container } = render(<PublicationRatingCoverBadge ratingAvg={4.2} ratingCount={3} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders formatted average when count meets threshold', () => {
    render(<PublicationRatingCoverBadge ratingAvg={4.25} ratingCount={10} />);
    expect(screen.getByText('4.3')).toBeTruthy();
    expect(screen.getByLabelText('rating.avgAria:4.3:10')).toBeTruthy();
    expect(document.querySelector('.publication-rating-cover-badge')).toBeTruthy();
  });
});
