import type { Language } from '../../types/common.js';

/** Target languages that require gender agreement rules in prompts. */
export type GenderAgreementTarget = 'ru' | 'be';

export function resolveGenderAgreementTarget(
  targetLanguage?: Language
): GenderAgreementTarget | null {
  if (targetLanguage === 'ru' || targetLanguage === 'be') {
    return targetLanguage;
  }
  return null;
}
