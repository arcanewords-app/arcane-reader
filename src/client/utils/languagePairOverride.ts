import {
  languagePairsEqual,
  projectDefaultLanguagePair,
  type LanguagePairValue,
} from '../constants/translationLanguages';
import type { TranslationStageKind } from '../types';

export function getLanguageOverrideWarnings(options: {
  batchLanguagePair: LanguagePairValue;
  project: { sourceLanguage?: string; targetLanguage?: string; glossary: { length: number } };
  selectedStages: TranslationStageKind[];
  hasTranslatedContent: boolean;
  t: (key: string, interpolation?: Record<string, string>) => string;
}): string[] {
  const projectDefault = projectDefaultLanguagePair(options.project);
  if (languagePairsEqual(options.batchLanguagePair, projectDefault)) {
    return [];
  }

  const targetLanguageLabel =
    options.t(`language.${options.batchLanguagePair.targetLanguage}`) ||
    String(options.batchLanguagePair.targetLanguage).toUpperCase();

  const warnings: string[] = [];
  if (options.project.glossary.length > 0) {
    warnings.push(
      options.t('processChapters.languageOverrideGlossaryWarning', { targetLanguageLabel })
    );
  }

  const runsTranslateOrEdit =
    options.selectedStages.includes('translation') || options.selectedStages.includes('editing');
  if (runsTranslateOrEdit && options.hasTranslatedContent) {
    warnings.push(
      options.t('processChapters.languageOverrideTranslationWarning', { targetLanguageLabel })
    );
  }

  return warnings;
}

export function toLanguagePairOverride(
  batchLanguagePair: LanguagePairValue,
  project: { sourceLanguage?: string; targetLanguage?: string }
): { sourceLanguage: string; targetLanguage: string } | undefined {
  const projectDefault = projectDefaultLanguagePair(project);
  if (languagePairsEqual(batchLanguagePair, projectDefault)) {
    return undefined;
  }
  return {
    sourceLanguage: String(batchLanguagePair.sourceLanguage),
    targetLanguage: batchLanguagePair.targetLanguage,
  };
}
