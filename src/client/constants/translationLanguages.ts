/** MVP project translation pair (must match engine whitelist). */
export const PROJECT_SOURCE_LANGUAGES = ['en', 'ko', 'zh'] as const;
export type ProjectSourceLanguage = (typeof PROJECT_SOURCE_LANGUAGES)[number];
export const PROJECT_TARGET_LANGUAGE = 'ru' as const;

export function formatLanguagePairLabel(
  t: (key: string) => string,
  source: string,
  target: string
): string {
  const sourceLabel = t(`language.${source}`) || source.toUpperCase();
  const targetLabel = t(`language.${target}`) || target.toUpperCase();
  return `${sourceLabel} → ${targetLabel}`;
}

export function sourceLanguageOptions(t: (key: string) => string) {
  return PROJECT_SOURCE_LANGUAGES.map((code) => ({
    value: code,
    label: t(`language.${code}`) || code.toUpperCase(),
  }));
}

export function targetLanguageOptions(t: (key: string) => string) {
  return [
    {
      value: PROJECT_TARGET_LANGUAGE,
      label: t(`language.${PROJECT_TARGET_LANGUAGE}`) || PROJECT_TARGET_LANGUAGE.toUpperCase(),
    },
  ];
}
