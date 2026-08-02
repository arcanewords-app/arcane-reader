/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn().mockResolvedValue(undefined);
let mockUsage: { tokensUsed: number; tokensLimit: number; tokensBlocked?: number } | null = {
  tokensUsed: 0,
  tokensLimit: 1000,
};
const isAuthenticated = vi.fn(() => true);

vi.mock('../contexts/TokenUsageContext.js', () => ({
  useTokenUsageContext: () => ({
    usage: mockUsage,
    refresh,
    loading: false,
    error: null,
  }),
}));

vi.mock('../services/authService.js', () => ({
  authService: {
    isAuthenticated: () => isAuthenticated(),
  },
}));

import { useTokenLimitCheck } from './useTokenLimitCheck.js';

describe('useTokenLimitCheck', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockUsage = { tokensUsed: 0, tokensLimit: 1000 };
    isAuthenticated.mockReturnValue(true);
  });

  it('calls onProceed when status is ok', () => {
    const onProceed = vi.fn();
    const { result } = renderHook(() => useTokenLimitCheck());

    let status: string;
    act(() => {
      status = result.current.checkBeforeTranslate(10, onProceed);
    });

    expect(status!).toBe('ok');
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(result.current.warningState.isOpen).toBe(false);
  });

  it('opens warning with onProceed when status is warn', () => {
    mockUsage = { tokensUsed: 850, tokensLimit: 1000 };
    const onProceed = vi.fn();
    const { result } = renderHook(() => useTokenLimitCheck());

    let status: string;
    act(() => {
      status = result.current.checkBeforeTranslate(50, onProceed);
    });

    expect(status!).toBe('warn');
    expect(onProceed).not.toHaveBeenCalled();
    expect(result.current.warningState.isOpen).toBe(true);
    expect(result.current.warningState.willExceed).toBe(false);
    expect(result.current.warningState.onProceed).toBeTypeOf('function');
  });

  it('blocks with willExceed and null onProceed when over limit', () => {
    mockUsage = { tokensUsed: 950, tokensLimit: 1000 };
    const onProceed = vi.fn();
    const { result } = renderHook(() => useTokenLimitCheck());

    let status: string;
    act(() => {
      status = result.current.checkBeforeTranslate(100, onProceed);
    });

    expect(status!).toBe('block');
    expect(onProceed).not.toHaveBeenCalled();
    expect(result.current.warningState.isOpen).toBe(true);
    expect(result.current.warningState.willExceed).toBe(true);
    expect(result.current.warningState.onProceed).toBeNull();
  });

  it('confirmAndProceed runs stored callback and closes warning', () => {
    mockUsage = { tokensUsed: 850, tokensLimit: 1000 };
    const onProceed = vi.fn();
    const { result } = renderHook(() => useTokenLimitCheck());

    act(() => {
      result.current.checkBeforeTranslate(50, onProceed);
    });

    act(() => {
      result.current.confirmAndProceed();
    });

    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(result.current.warningState.isOpen).toBe(false);
    expect(result.current.warningState.onProceed).toBeNull();
  });

  it('closeWarning dismisses without calling onProceed', () => {
    mockUsage = { tokensUsed: 850, tokensLimit: 1000 };
    const onProceed = vi.fn();
    const { result } = renderHook(() => useTokenLimitCheck());

    act(() => {
      result.current.checkBeforeTranslate(50, onProceed);
    });

    act(() => {
      result.current.closeWarning();
    });

    expect(onProceed).not.toHaveBeenCalled();
    expect(result.current.warningState.isOpen).toBe(false);
  });
});
