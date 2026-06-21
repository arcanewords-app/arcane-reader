/**
 * Chapter Critic input limits and issue budget (prod).
 */

export const CRITIC_MAX_INPUT_CHARS = 70_000;

/** Chapters above this paragraph count need chunked critic (phase 2). */
export const CRITIC_CHUNKED_PARAGRAPH_THRESHOLD = 100;

export interface CriticInputStats {
  sourceChars: number;
  translationChars: number;
  glossaryChars: number;
  totalChars: number;
  maxInputChars: number;
  tooLarge: boolean;
  paragraphCount: number;
}

export function buildCriticInputStats(parts: {
  sourceChars: number;
  translationChars: number;
  glossaryChars: number;
  paragraphCount: number;
}): CriticInputStats {
  const totalChars = parts.sourceChars + parts.translationChars + parts.glossaryChars;
  return {
    ...parts,
    totalChars,
    maxInputChars: CRITIC_MAX_INPUT_CHARS,
    tooLarge: totalChars > CRITIC_MAX_INPUT_CHARS,
  };
}

export function criticInputTooLargeMessage(stats: CriticInputStats): string {
  return `Chapter too long for translation review (${stats.totalChars} chars, max ${stats.maxInputChars}).`;
}

/** Max issues returned by the critic model, scaled by chapter length. */
export function resolveCriticIssueBudget(paragraphCount: number): number {
  if (paragraphCount <= 30) return 12;
  if (paragraphCount <= 60) return 18;
  if (paragraphCount <= CRITIC_CHUNKED_PARAGRAPH_THRESHOLD) return 24;
  return 24;
}

export function criticNeedsHighOutputBudget(paragraphCount: number, totalChars: number): boolean {
  return paragraphCount > 60 || totalChars > 40_000;
}
