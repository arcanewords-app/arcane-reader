import type { LabLanguage } from '../api/client';

export const LANGUAGE_LABELS: Record<LabLanguage, string> = {
  en: 'English',
  ko: 'Korean',
  zh: 'Chinese',
  ru: 'Russian',
  be: 'Belarusian',
};

export const TARGET_LANGUAGES: LabLanguage[] = ['ru', 'be'];

export function sourcesForTarget(target: LabLanguage): LabLanguage[] {
  if (target === 'be') return ['en', 'ko', 'zh', 'ru'];
  return ['en', 'ko', 'zh'];
}

export function coerceSourceForTarget(source: LabLanguage, target: LabLanguage): LabLanguage {
  const allowed = sourcesForTarget(target);
  if (allowed.includes(source)) return source;
  return 'en';
}

export function formatPairLabel(source: LabLanguage, target: LabLanguage): string {
  return `${LANGUAGE_LABELS[source]} → ${LANGUAGE_LABELS[target]}`;
}

export const STAGE_DESCRIPTIONS: Record<string, string> = {
  analyze: 'Extract characters, locations, and terms from source text.',
  translate: 'Translate source text using pair-specific translator prompts.',
  edit: 'Polish translated text. Only target language affects the editor prompt.',
};
