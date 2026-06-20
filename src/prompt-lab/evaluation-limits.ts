/**
 * Shared evaluation input limits (server + Prompt Lab UI).
 */

export const EVALUATION_MAX_INPUT_CHARS = 50_000;

/** Above this threshold, evaluator prompt omits full polished translation. */
export const EVALUATION_LONG_CHAPTER_CHARS = 15_000;

export interface EvaluationInputStats {
  sourceChars: number;
  leftChars: number;
  rightChars: number;
  glossaryChars: number;
  totalChars: number;
  maxInputChars: number;
  tooLarge: boolean;
  compactOutput: boolean;
}

export function buildEvaluationInputStats(parts: {
  sourceChars: number;
  leftChars: number;
  rightChars: number;
  glossaryChars: number;
}): EvaluationInputStats {
  const totalChars = parts.sourceChars + parts.leftChars + parts.rightChars + parts.glossaryChars;
  return {
    ...parts,
    totalChars,
    maxInputChars: EVALUATION_MAX_INPUT_CHARS,
    tooLarge: totalChars > EVALUATION_MAX_INPUT_CHARS,
    compactOutput: totalChars > EVALUATION_LONG_CHAPTER_CHARS,
  };
}

export function evaluationInputTooLargeMessage(stats: EvaluationInputStats): string {
  return `Chapter too long for A/B evaluation (${stats.totalChars} chars, max ${stats.maxInputChars}). Try shorter excerpt or split runs.`;
}
