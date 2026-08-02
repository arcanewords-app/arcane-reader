// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number; score?: number }) => {
      if (opts?.count != null) return `${key}:${opts.count}`;
      if (opts?.score != null) return `${key}:${opts.score}`;
      return key;
    },
  }),
}));

import { PublicationRatingSummary } from './PublicationRatingSummary.js';

describe('PublicationRatingSummary', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders aggregate summary when count meets threshold', () => {
    render(
      <PublicationRatingSummary
        ratingAvg={4.2}
        ratingCount={10}
        userScore={null}
        eligibility="eligible"
        onRateClick={vi.fn()}
        onLoginClick={vi.fn()}
      />
    );
    expect(screen.getByLabelText('rating.summary')).toBeTruthy();
    expect(screen.getByText('4.2')).toBeTruthy();
    expect(screen.getByText('rating.count:10')).toBeTruthy();
    expect(screen.getByText('rating.rate')).toBeTruthy();
  });

  it('calls onRateClick for eligible users', () => {
    const onRateClick = vi.fn();
    render(
      <PublicationRatingSummary
        ratingAvg={null}
        ratingCount={0}
        userScore={null}
        eligibility="eligible"
        onRateClick={onRateClick}
        onLoginClick={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('rating.rate'));
    expect(onRateClick).toHaveBeenCalledTimes(1);
  });

  it('calls onLoginClick for guests', () => {
    const onLoginClick = vi.fn();
    render(
      <PublicationRatingSummary
        ratingAvg={null}
        ratingCount={0}
        userScore={null}
        eligibility="guest"
        onRateClick={vi.fn()}
        onLoginClick={onLoginClick}
      />
    );
    fireEvent.click(screen.getByText('rating.rate'));
    expect(onLoginClick).toHaveBeenCalledTimes(1);
  });
});
