/**
 * Shared CJK-aware token estimation helpers.
 */

/** True if character is CJK (Han, Hangul, Hiragana, Katakana). */
export function isCjkCharCode(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af)
  );
}

/**
 * CJK-aware heuristic: ~1 token per CJK char, ~0.25 per Latin char.
 * Used when tiktoken is unavailable and by OpenAI provider estimateTokens.
 */
export function estimateTokensHeuristic(text: string): number {
  if (!text || text.length === 0) return 0;
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    tokens += isCjkCharCode(code) ? 1 : 0.25;
  }
  return Math.ceil(tokens);
}

/**
 * Count CJK characters in text (for diagnostics).
 */
export function countCjkCharacters(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (isCjkCharCode(text.charCodeAt(i))) count++;
  }
  return count;
}
