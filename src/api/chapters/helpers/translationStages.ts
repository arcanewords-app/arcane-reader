/**
 * Translation stage parsing — extracted from chapters routes for unit testing.
 */

import type { TranslationStages } from '../../../config/tokenLimits.js';

export type TranslationStageKind = 'analysis' | 'translation' | 'editing';

export function isTranslationStageKind(s: string): s is TranslationStageKind {
  return s === 'analysis' || s === 'translation' || s === 'editing';
}

/** Normalize stages from request body (array, 'all', or omitted). */
export function parseTranslationStages(stagesRaw: unknown): TranslationStages {
  if (Array.isArray(stagesRaw) && stagesRaw.length > 0) {
    const arr = stagesRaw.filter((s): s is TranslationStageKind =>
      isTranslationStageKind(String(s))
    );
    if (arr.length > 0) return [...new Set(arr)];
  }
  if (stagesRaw === 'all') return 'all';
  return 'all';
}
