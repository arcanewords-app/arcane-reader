/**
 * Translation stage dispatch — two-phase editing, phase-1 stages, glossary flags.
 */

import type { TranslationStages } from '../../../config/tokenLimits.js';

export function shouldRunTwoPhaseEditing(stages: TranslationStages): boolean {
  const includesEditing = stages === 'all' || (Array.isArray(stages) && stages.includes('editing'));
  const includesTranslation =
    stages === 'all' || (Array.isArray(stages) && stages.includes('translation'));
  return includesEditing && includesTranslation;
}

export function resolvePhase1Stages(
  stages: TranslationStages,
  runEditing: boolean
): TranslationStages {
  if (!runEditing) return stages;
  if (stages === 'all') return ['analysis', 'translation'];
  if (Array.isArray(stages)) {
    return stages.filter((s) => s !== 'editing') as ('analysis' | 'translation')[];
  }
  return ['analysis', 'translation'];
}

export function resolvePhase1IncludeGlossaryInTranslation(
  projectSetting: boolean | undefined,
  runEditing: boolean
): boolean {
  return projectSetting ?? (runEditing ? false : true);
}

export function needsExistingTranslatedTextForEditing(stages: TranslationStages): boolean {
  return Array.isArray(stages) && stages.includes('editing') && !stages.includes('translation');
}

export function isAnalysisOnlyRun(stages: TranslationStages): boolean {
  return Array.isArray(stages) && stages.length === 1 && stages[0] === 'analysis';
}

export function shouldTranslateChapterTitles(
  stages: TranslationStages,
  options: {
    translateChapterTitles?: boolean;
    deferChapterTitleTranslation?: boolean;
  }
): boolean {
  if (options.translateChapterTitles === false || options.deferChapterTitleTranslation) {
    return false;
  }
  return stages === 'all' || (Array.isArray(stages) && stages.includes('translation'));
}

export interface StageModelNames {
  analysis: string;
  translation: string;
  editing: string;
}

export function formatStageModelInfo(stages: TranslationStages, models: StageModelNames): string {
  if (stages === 'all') {
    return `${models.analysis}/${models.translation}/${models.editing}`;
  }
  if (Array.isArray(stages)) {
    return stages
      .map((s) =>
        s === 'analysis'
          ? models.analysis
          : s === 'translation'
            ? models.translation
            : models.editing
      )
      .join('/');
  }
  return models.editing;
}

export function phase1StagesIncludeAnalysis(phase1Stages: TranslationStages): boolean {
  return (
    (typeof phase1Stages === 'string' && phase1Stages === 'all') ||
    (Array.isArray(phase1Stages) && phase1Stages.includes('analysis'))
  );
}
