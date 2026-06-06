/**
 * Supported translation languages and pair validation.
 * MVP: en | ko | zh | ru (ru source only for be target) → ru | be.
 * Japanese (ja) is Phase 2 — not in whitelist yet.
 */

import type { Language } from './types/common.js';

export const PROJECT_DEFAULT_SOURCE_LANGUAGE = 'en' as const;
export const PROJECT_DEFAULT_TARGET_LANGUAGE = 'ru' as const;

export const SUPPORTED_SOURCE_LANGUAGES = ['en', 'ko', 'zh', 'ru'] as const;
export type SupportedSourceLanguage = (typeof SUPPORTED_SOURCE_LANGUAGES)[number];

export const SUPPORTED_TARGET_LANGUAGES = ['ru', 'be'] as const;
export type SupportedTargetLanguage = (typeof SUPPORTED_TARGET_LANGUAGES)[number];

export type SupportedTranslationPair = `${SupportedSourceLanguage}-${SupportedTargetLanguage}`;

export const SUPPORTED_TRANSLATION_PAIRS: SupportedTranslationPair[] = [
  'en-ru',
  'ko-ru',
  'zh-ru',
  'en-be',
  'ko-be',
  'zh-be',
  'ru-be',
];

const SOURCE_SET = new Set<string>(SUPPORTED_SOURCE_LANGUAGES);
const TARGET_SET = new Set<string>(SUPPORTED_TARGET_LANGUAGES);
const PAIR_SET = new Set<string>(SUPPORTED_TRANSLATION_PAIRS);

const DISPLAY_NAMES: Record<SupportedSourceLanguage | SupportedTargetLanguage, string> = {
  en: 'English',
  ko: 'Korean',
  zh: 'Chinese',
  ru: 'Russian',
  be: 'Belarusian',
};

/** Source languages valid for a given target (for UI filtering). */
export function sourcesForTarget(target: SupportedTargetLanguage): SupportedSourceLanguage[] {
  if (target === 'ru') {
    return ['en', 'ko', 'zh'];
  }
  return ['en', 'ko', 'zh', 'ru'];
}

/** Parse raw DB/API value to Language with fallback for legacy projects. */
export function parseProjectLanguage(
  raw: string | undefined | null,
  role: 'source' | 'target'
): Language {
  const normalized = (raw ?? '').trim().toLowerCase();
  const allowed = role === 'source' ? SOURCE_SET : TARGET_SET;
  const fallback =
    role === 'source' ? PROJECT_DEFAULT_SOURCE_LANGUAGE : PROJECT_DEFAULT_TARGET_LANGUAGE;
  if (allowed.has(normalized)) {
    return normalized as Language;
  }
  return fallback as Language;
}

export function parseProjectLanguagePair(
  sourceRaw: string | undefined | null,
  targetRaw: string | undefined | null
): { sourceLanguage: Language; targetLanguage: Language } {
  const sourceLanguage = parseProjectLanguage(sourceRaw, 'source');
  const targetLanguage = parseProjectLanguage(targetRaw, 'target');
  assertSupportedPair(sourceLanguage, targetLanguage);
  return { sourceLanguage, targetLanguage };
}

export function pairKey(source: Language, target: Language): string {
  return `${source}-${target}`;
}

export function isSupportedPair(source: Language, target: Language): boolean {
  return PAIR_SET.has(pairKey(source, target));
}

export function assertSupportedPair(source: Language, target: Language): void {
  if (!isSupportedPair(source, target)) {
    throw new Error(
      `Unsupported translation pair: ${source}→${target}. Supported: ${SUPPORTED_TRANSLATION_PAIRS.join(', ')}`
    );
  }
}

export function languageDisplayName(lang: Language): string {
  const key = lang as SupportedSourceLanguage | SupportedTargetLanguage;
  return DISPLAY_NAMES[key] ?? lang;
}

/** True when original name is primarily Latin script (EN transliteration applies). */
export function isLatinScriptName(text: string): boolean {
  if (!text.trim()) return false;
  return /^[\p{Script=Latin}\s\-'.]+$/u.test(text.trim());
}
