/**
 * AI smart replace presets for project search (Author+).
 */

export const AI_REPLACE_PRESET_IDS = ['name_declension', 'term_unify', 'minimal_fix'] as const;

export type AiReplacePresetId = (typeof AI_REPLACE_PRESET_IDS)[number];

export const AI_REPLACE_MAX_PARAGRAPHS = 100;
export const AI_REPLACE_MAX_INPUT_CHARS = 50_000;
export const AI_REPLACE_BATCH_SIZE = 20;
export const AI_REPLACE_DETAIL_MAX_CHARS = 200;

/** i18n key under searchReplace.aiPreset.* */
export function aiReplacePresetLabelKey(preset: AiReplacePresetId): string {
  return `searchReplace.aiPreset.${preset}`;
}

export function buildPresetInstruction(
  preset: AiReplacePresetId,
  targetLanguageLabel: string
): string {
  switch (preset) {
    case 'name_declension':
      return `Fix Russian name declension in ${targetLanguageLabel} translation. Use the canonical name form from the replace hint when provided. Change only name forms related to the search fragment; preserve grammatical case appropriate to each sentence.`;
    case 'term_unify':
      return `Unify terminology in ${targetLanguageLabel} translation. Align spelling and wording of the searched term with the replace hint when provided. Change only the relevant term occurrences; do not rephrase unrelated text.`;
    case 'minimal_fix':
      return `Apply a minimal targeted fix in ${targetLanguageLabel} translation around the searched fragment. Fix only clear errors tied to the search context. Do not rewrite style or restructure sentences.`;
    default:
      return `Apply a minimal targeted fix in ${targetLanguageLabel} translation.`;
  }
}

export function sanitizeAiReplaceDetail(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const cleaned = input
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, AI_REPLACE_DETAIL_MAX_CHARS);
  return cleaned || undefined;
}
