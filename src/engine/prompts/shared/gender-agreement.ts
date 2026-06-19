import type { Language } from '../../types/common.js';
import { GENDER_AGREEMENT_BE } from './gender-agreement-be.js';
import { GENDER_AGREEMENT_RU } from './gender-agreement-ru.js';
import {
  resolveGenderAgreementTarget,
  type GenderAgreementTarget,
} from './gender-agreement-target.js';
import { appendTranslationExamples } from './translation-examples.js';

export type { GenderAgreementTarget };
export { resolveGenderAgreementTarget };

export interface BuildTranslateSystemPromptOptions {
  enableFewShot?: boolean;
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

/** System prompt for Stage 2: optional few-shot examples, then gender rules. */
export function buildTranslateSystemPrompt(
  baseSystemPrompt: string,
  targetLanguage?: Language,
  options?: BuildTranslateSystemPromptOptions
): string {
  let prompt = baseSystemPrompt;
  if (options?.enableFewShot) {
    prompt = appendTranslationExamples(prompt, targetLanguage);
  }
  return appendGenderAgreement(prompt, targetLanguage);
}
