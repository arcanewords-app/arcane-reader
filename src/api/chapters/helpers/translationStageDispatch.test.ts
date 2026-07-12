import { describe, expect, it } from 'vitest';
import {
  formatStageModelInfo,
  isAnalysisOnlyRun,
  needsExistingTranslatedTextForEditing,
  phase1StagesIncludeAnalysis,
  resolvePhase1IncludeGlossaryInTranslation,
  resolvePhase1Stages,
  shouldRunTwoPhaseEditing,
  shouldTranslateChapterTitles,
} from './translationStageDispatch.js';

const models = { analysis: 'a-model', translation: 't-model', editing: 'e-model' };

describe('translationStageDispatch', () => {
  it('shouldRunTwoPhaseEditing is true for all and translation+editing', () => {
    expect(shouldRunTwoPhaseEditing('all')).toBe(true);
    expect(shouldRunTwoPhaseEditing(['translation', 'editing'])).toBe(true);
    expect(shouldRunTwoPhaseEditing(['translation'])).toBe(false);
    expect(shouldRunTwoPhaseEditing(['analysis'])).toBe(false);
  });

  it('resolvePhase1Stages strips editing when two-phase', () => {
    expect(resolvePhase1Stages('all', true)).toEqual(['analysis', 'translation']);
    expect(resolvePhase1Stages(['analysis', 'translation', 'editing'], true)).toEqual([
      'analysis',
      'translation',
    ]);
    expect(resolvePhase1Stages(['translation'], false)).toEqual(['translation']);
  });

  it('resolvePhase1IncludeGlossaryInTranslation defaults by runEditing', () => {
    expect(resolvePhase1IncludeGlossaryInTranslation(undefined, true)).toBe(false);
    expect(resolvePhase1IncludeGlossaryInTranslation(undefined, false)).toBe(true);
    expect(resolvePhase1IncludeGlossaryInTranslation(false, false)).toBe(false);
  });

  it('needsExistingTranslatedTextForEditing detects editing-only', () => {
    expect(needsExistingTranslatedTextForEditing(['editing'])).toBe(true);
    expect(needsExistingTranslatedTextForEditing(['translation', 'editing'])).toBe(false);
  });

  it('isAnalysisOnlyRun detects single analysis stage', () => {
    expect(isAnalysisOnlyRun(['analysis'])).toBe(true);
    expect(isAnalysisOnlyRun(['analysis', 'translation'])).toBe(false);
  });

  it('shouldTranslateChapterTitles respects flags and stages', () => {
    expect(shouldTranslateChapterTitles('all', {})).toBe(true);
    expect(shouldTranslateChapterTitles(['analysis'], {})).toBe(false);
    expect(shouldTranslateChapterTitles('all', { translateChapterTitles: false })).toBe(false);
    expect(shouldTranslateChapterTitles('all', { deferChapterTitleTranslation: true })).toBe(false);
  });

  it('formatStageModelInfo builds model string per stages', () => {
    expect(formatStageModelInfo('all', models)).toBe('a-model/t-model/e-model');
    expect(formatStageModelInfo(['translation'], models)).toBe('t-model');
  });

  it('phase1StagesIncludeAnalysis detects analysis in phase1', () => {
    expect(phase1StagesIncludeAnalysis(['analysis', 'translation'])).toBe(true);
    expect(phase1StagesIncludeAnalysis(['translation'])).toBe(false);
  });
});
