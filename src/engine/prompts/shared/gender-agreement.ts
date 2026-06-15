import type { Language } from '../../types/common.js';
import { GENDER_AGREEMENT_BE } from './gender-agreement-be.js';
import { GENDER_AGREEMENT_RU } from './gender-agreement-ru.js';

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

export function getGenderAgreementFragment(targetLanguage?: Language): string {
  const target = resolveGenderAgreementTarget(targetLanguage);
  if (target === 'be') return GENDER_AGREEMENT_BE;
  if (target === 'ru') return GENDER_AGREEMENT_RU;
  return '';
}

export function appendGenderAgreement(systemPrompt: string, targetLanguage?: Language): string {
  const fragment = getGenderAgreementFragment(targetLanguage);
  if (!fragment.trim()) return systemPrompt;
  return systemPrompt.trimEnd() + '\n' + fragment;
}
