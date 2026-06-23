/**
 * Token estimate for project AI smart replace (client + server SSOT).
 */

import { AI_REPLACE_BATCH_SIZE } from './aiReplacePresets.js';

const PROMPT_OVERHEAD_PER_BATCH = 1500;
const CHARS_PER_TOKEN = 3;

/** Rough token cost: input chars + fixed overhead per LLM batch. */
export function estimateAiReplaceTokens(totalChars: number, paragraphCount: number): number {
  const batches = Math.max(1, Math.ceil(paragraphCount / AI_REPLACE_BATCH_SIZE));
  const inputTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
  return inputTokens + PROMPT_OVERHEAD_PER_BATCH * batches;
}
