import { useCallback } from 'preact/hooks';
import { estimateTokensForStages, type TranslationStages } from '../config/tokenEstimate';

/**
 * Returns a function to estimate tokens for translation by stages.
 * Uses stages from the request (default 'all'); no longer uses project settings for stages.
 */
export function useTokenEstimate(): (textLength: number, stages?: TranslationStages) => number {
  return useCallback((textLength: number, stages: TranslationStages = 'all'): number => {
    return estimateTokensForStages(textLength, stages);
  }, []);
}
