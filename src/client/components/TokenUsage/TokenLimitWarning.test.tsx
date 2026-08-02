// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TokenUsage } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { TokenLimitWarning } from './TokenLimitWarning.js';

function makeUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    date: '2026-08-02',
    tokensUsed: 1000,
    tokensBlocked: 0,
    tokensLimit: 10000,
    tokensRemaining: 9000,
    percentageUsed: 10,
    warning: false,
    ...overrides,
  };
}

describe('TokenLimitWarning', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('shows unlimited note when tokensLimit is 0', () => {
    const onClose = vi.fn();
    render(
      <TokenLimitWarning
        isOpen
        onClose={onClose}
        onConfirm={vi.fn()}
        usage={makeUsage({ tokensLimit: 0 })}
        estimatedTokens={500}
      />
    );
    expect(screen.getByText('tokenUsage.unlimited')).toBeTruthy();
    expect(screen.getByText('tokenLimit.unlimitedNote')).toBeTruthy();
    fireEvent.click(screen.getByText('common.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows exceeded title when translation would exceed limit', () => {
    render(
      <TokenLimitWarning
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        usage={makeUsage({ tokensUsed: 9000, tokensLimit: 10000 })}
        estimatedTokens={2000}
      />
    );
    expect(screen.getByText('tokenLimit.titleExceeded')).toBeTruthy();
    expect(screen.getByText('tokenLimit.messageExceeded')).toBeTruthy();
    expect(screen.queryByText('common.continue')).toBeNull();
  });

  it('shows warning and confirms via onConfirm', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <TokenLimitWarning
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        usage={makeUsage({ tokensUsed: 8000, tokensLimit: 10000 })}
        estimatedTokens={1000}
      />
    );
    expect(screen.getByText('tokenLimit.titleWarning')).toBeTruthy();
    expect(document.querySelector('.modal-overlay')).toBeTruthy();
    fireEvent.click(screen.getByText('common.continue'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
