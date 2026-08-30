// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TokenUsage } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { remaining?: string; limit?: string }) =>
      opts?.limit ? `${key}:${opts.remaining}:${opts.limit}` : key,
  }),
}));

const isAuthenticated = vi.fn(() => true);
let mockContext: {
  usage: TokenUsage | null;
  loading: boolean;
  error: string | null;
} = {
  usage: null,
  loading: false,
  error: null,
};

vi.mock('../../services/authService.js', () => ({
  authService: {
    isAuthenticated: () => isAuthenticated(),
  },
}));

vi.mock('../../contexts/TokenUsageContext.js', () => ({
  useTokenUsageContext: () => mockContext,
}));

import { TokenUsageIndicator } from './TokenUsageIndicator.js';

function makeUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    date: '2026-08-02',
    tokensUsed: 5000,
    tokensBlocked: 0,
    tokensLimit: 10000,
    tokensRemaining: 5000,
    percentageUsed: 50,
    warning: false,
    ...overrides,
  };
}

describe('TokenUsageIndicator', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    isAuthenticated.mockReturnValue(true);
    mockContext = { usage: makeUsage(), loading: false, error: null };
  });

  it('renders nothing when not authenticated', () => {
    isAuthenticated.mockReturnValue(false);
    const { container } = render(<TokenUsageIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('shows loading state when usage is not yet available', () => {
    mockContext = { usage: null, loading: true, error: null };
    render(<TokenUsageIndicator />);
    expect(screen.getByText('tokenUsage.loading')).toBeTruthy();
  });

  it('renders nothing on error or missing usage', () => {
    mockContext = { usage: null, loading: false, error: 'Failed to load' };
    const { container } = render(<TokenUsageIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('shows remaining credits; daily cap is only in the hover tooltip', () => {
    mockContext = {
      usage: makeUsage({
        tokensUsed: 8500,
        tokensRemaining: 1500,
        tokensLimit: 10000,
        percentageUsed: 85,
        warning: true,
      }),
      loading: false,
      error: null,
    };
    render(<TokenUsageIndicator showDetails />);
    expect(screen.getByText('1,500')).toBeTruthy();
    expect(document.querySelector('.token-usage-text')?.textContent).toBe('1,500');
    const hint = 'tokenUsage.remainingCreditsTitle:1,500:10,000';
    const indicator = document.querySelector('.token-usage-indicator');
    expect(indicator?.tagName).toBe('DIV');
    expect(indicator?.getAttribute('title')).toBeNull();
    expect(document.querySelector('.token-usage-sr-only')?.textContent).toBe(hint);
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toBe(hint);
    expect(document.querySelector('.token-usage-progress.warning')).toBeTruthy();
    expect(screen.getByText('tokenUsage.approachingLimit')).toBeTruthy();
  });

  it('shows unlimited label when tokensLimit is negative', () => {
    mockContext = {
      usage: makeUsage({ tokensLimit: -1, tokensRemaining: -1, percentageUsed: 0 }),
      loading: false,
      error: null,
    };
    render(<TokenUsageIndicator />);
    expect(document.querySelector('.token-usage-text')?.textContent).toBe('tokenUsage.unlimited');
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toBe(
      'tokenUsage.unlimitedTitle'
    );
    expect(document.querySelector('.token-usage-progress')).toBeNull();
  });

  it('shows stage breakdown when showDetails is true', () => {
    mockContext = {
      usage: makeUsage({
        tokensByStage: { analysis: 100, translation: 400, editing: 50 },
      }),
      loading: false,
      error: null,
    };
    render(<TokenUsageIndicator showDetails />);
    expect(screen.getByText(/tokenUsage.analysis/)).toBeTruthy();
    expect(screen.getByText(/tokenUsage.translation/)).toBeTruthy();
    expect(screen.getByText(/tokenUsage.editing/)).toBeTruthy();
  });
});
