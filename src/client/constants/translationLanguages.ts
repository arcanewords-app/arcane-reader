/** MVP project translation pair (must match engine whitelist). */
export const PROJECT_SOURCE_LANGUAGES = ['en', 'ko', 'zh', 'ru'] as const;
export type ProjectSourceLanguage = (typeof PROJECT_SOURCE_LANGUAGES)[number];

export const PROJECT_TARGET_LANGUAGES = ['ru', 'be'] as const;
export type ProjectTargetLanguage = (typeof PROJECT_TARGET_LANGUAGES)[number];

export const PROJECT_DEFAULT_SOURCE_LANGUAGE = 'en' as const;
export const PROJECT_DEFAULT_TARGET_LANGUAGE = 'ru' as const;

/** @deprecated Use PROJECT_DEFAULT_TARGET_LANGUAGE */
export const PROJECT_TARGET_LANGUAGE = PROJECT_DEFAULT_TARGET_LANGUAGE;

/** Sources valid for a target language (ru source only when target is be). */
export function sourcesForTarget(target: string): ProjectSourceLanguage[] {
  if (target === 'be') {
    return ['en', 'ko', 'zh', 'ru'];
  }
  return ['en', 'ko', 'zh'];
}

export function isValidLanguagePair(source: string, target: string): boolean {
  return sourcesForTarget(target).includes(source as ProjectSourceLanguage);
}

export function formatLanguagePairLabel(
  t: (key: string) => string,
  source: string,
  target: string
): string {
  const sourceLabel = t(`language.${source}`) || source.toUpperCase();
  const targetLabel = t(`language.${target}`) || target.toUpperCase();
  return `${sourceLabel} → ${targetLabel}`;
}

export function sourceLanguageOptions(
  t: (key: string) => string,
  targetLanguage: string = PROJECT_DEFAULT_TARGET_LANGUAGE
) {
  return sourcesForTarget(targetLanguage).map((code) => ({
    value: code,
    label: t(`language.${code}`) || code.toUpperCase(),
  }));
}

export function targetLanguageOptions(t: (key: string) => string) {
  return PROJECT_TARGET_LANGUAGES.map((code) => ({
    value: code,
    label: t(`language.${code}`) || code.toUpperCase(),
  }));
}

export interface LanguagePairValue {
  sourceLanguage: ProjectSourceLanguage | string;
  targetLanguage: string;
}

export function normalizeProjectSourceLanguage(
  raw: string | undefined,
  targetLanguage: string = PROJECT_DEFAULT_TARGET_LANGUAGE
): ProjectSourceLanguage {
  const allowed = sourcesForTarget(targetLanguage);
  if (allowed.includes(raw as ProjectSourceLanguage)) {
    return raw as ProjectSourceLanguage;
  }
  return PROJECT_DEFAULT_SOURCE_LANGUAGE;
}

export function normalizeProjectTargetLanguage(raw: string | undefined): ProjectTargetLanguage {
  if ((PROJECT_TARGET_LANGUAGES as readonly string[]).includes(raw ?? '')) {
    return raw as ProjectTargetLanguage;
  }
  return PROJECT_DEFAULT_TARGET_LANGUAGE;
}

/** When target changes, reset source if it is no longer valid (e.g. ru source + ru target). */
export function coerceSourceForTargetChange(
  source: string,
  newTarget: string
): ProjectSourceLanguage {
  return normalizeProjectSourceLanguage(source, newTarget);
}

export function projectDefaultLanguagePair(project: {
  sourceLanguage?: string;
  targetLanguage?: string;
}): LanguagePairValue {
  const targetLanguage = normalizeProjectTargetLanguage(project.targetLanguage);
  return {
    sourceLanguage: normalizeProjectSourceLanguage(project.sourceLanguage, targetLanguage),
    targetLanguage,
  };
}

export function languagePairsEqual(a: LanguagePairValue, b: LanguagePairValue): boolean {
  return a.sourceLanguage === b.sourceLanguage && a.targetLanguage === b.targetLanguage;
}
