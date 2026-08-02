/** @vitest-environment happy-dom */
import { renderHook } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';

import { estimateTokensForStages } from '../config/tokenEstimate.js';
import { useTokenEstimate } from './useTokenEstimate.js';

describe('useTokenEstimate', () => {
  it('returns stable estimator that delegates to estimateTokensForStages', () => {
    const { result, rerender } = renderHook(() => useTokenEstimate());
    const estimate = result.current;

    expect(estimate(10_000, 'all')).toBe(estimateTokensForStages(10_000, 'all'));
    expect(estimate(5_000, ['translation'])).toBe(estimateTokensForStages(5_000, ['translation']));

    rerender();
    expect(result.current).toBe(estimate);
  });
});
