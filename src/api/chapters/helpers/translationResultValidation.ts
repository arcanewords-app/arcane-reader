/**
 * Translation pipeline result validation — extracted from chapterTranslation.
 */

import { isChunkError } from '../../../shared/chunkErrors.js';

export interface PipelineResultLike {
  translatedText?: string | null;
  tokensUsed: number;
  duration: number;
}

export function validateTranslationPipelineResult(result: PipelineResultLike): {
  valid: boolean;
  errorMessage?: string;
} {
  const isValidTranslationResult =
    !!result.translatedText &&
    result.translatedText.trim().length > 0 &&
    !isChunkError(result.translatedText);

  const hasValidTokens = result.tokensUsed > 0 || result.duration > 0;

  if (!isValidTranslationResult) {
    return { valid: false, errorMessage: 'Translation empty or contains error' };
  }
  if (!hasValidTokens && result.duration === 0) {
    return {
      valid: false,
      errorMessage: 'Translation finished with no tokens used (possible error)',
    };
  }
  return { valid: true };
}

export function isValidPhase2TranslationText(translatedText: string | null | undefined): boolean {
  return !!translatedText && translatedText.trim().length > 0 && !isChunkError(translatedText);
}
