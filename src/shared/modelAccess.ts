/**
 * Role-based LLM model access for production project settings.
 * SSOT for tier gates; token limits: src/config/tokenLimits.ts
 */

import type { UserRole } from '../types/roles.js';
import { isAtLeastRole } from '../types/roles.js';
import {
  PROD_ANALYSIS_MODELS,
  PROD_TRANSLATE_EDIT_MODELS,
  type LlmModelOption,
  type LlmStage,
} from './prodModelLists.js';

export const AUTHOR_TIER_MODEL = 'gpt-4.1-mini';

/** Minimum role for full prod translate/edit model picker. */
export const PREMIUM_MODELS_MIN_ROLE: UserRole = 'author_plus';

export interface StageModels {
  analysis: string;
  translation: string;
  editing: string;
}

function normalizeProdStage(stage: LlmStage): 'analysis' | 'translation' | 'editing' {
  if (stage === 'analyze' || stage === 'analysis') return 'analysis';
  if (stage === 'translate' || stage === 'translation') return 'translation';
  return 'editing';
}

export function roleHasPremiumModelAccess(role: UserRole): boolean {
  return isAtLeastRole(role, PREMIUM_MODELS_MIN_ROLE);
}

/** Full prod list for UI (includes locked options for author tier). */
export function allProdModelsForStage(stage: LlmStage): LlmModelOption[] {
  const normalized = normalizeProdStage(stage);
  if (normalized === 'analysis') return PROD_ANALYSIS_MODELS;
  return PROD_TRANSLATE_EDIT_MODELS;
}

/** Models the role may actually select and run. */
export function modelsForProdSettingsByRole(stage: LlmStage, role: UserRole): LlmModelOption[] {
  const all = allProdModelsForStage(stage);
  if (roleHasPremiumModelAccess(role)) return all;
  const normalized = normalizeProdStage(stage);
  if (normalized === 'analysis') return PROD_ANALYSIS_MODELS;
  return PROD_ANALYSIS_MODELS.filter((m) => m.value === AUTHOR_TIER_MODEL);
}

export function isPremiumProdModel(stage: LlmStage, modelId: string): boolean {
  const normalized = normalizeProdStage(stage);
  if (normalized === 'analysis') return false;
  return modelId !== AUTHOR_TIER_MODEL;
}

export function clampStageModelForRole(modelId: string, stage: LlmStage, role: UserRole): string {
  const trimmed = modelId?.trim() ?? '';
  if (!trimmed) return AUTHOR_TIER_MODEL;
  if (roleHasPremiumModelAccess(role)) return trimmed;
  const normalized = normalizeProdStage(stage);
  if (normalized === 'analysis') return AUTHOR_TIER_MODEL;
  return AUTHOR_TIER_MODEL;
}

export function clampStageModelsForRole(
  stageModels: Partial<StageModels> | undefined,
  role: UserRole
): StageModels | undefined {
  if (!stageModels) return undefined;
  return {
    analysis: clampStageModelForRole(stageModels.analysis ?? AUTHOR_TIER_MODEL, 'analysis', role),
    translation: clampStageModelForRole(
      stageModels.translation ?? AUTHOR_TIER_MODEL,
      'translation',
      role
    ),
    editing: clampStageModelForRole(stageModels.editing ?? AUTHOR_TIER_MODEL, 'editing', role),
  };
}

/** Default stage models for a new project by role. */
export function defaultStageModelsForRole(role: UserRole): StageModels {
  if (roleHasPremiumModelAccess(role)) {
    return {
      analysis: AUTHOR_TIER_MODEL,
      translation: 'gpt-5.4-mini',
      editing: 'gpt-5.4-mini',
    };
  }
  return {
    analysis: AUTHOR_TIER_MODEL,
    translation: AUTHOR_TIER_MODEL,
    editing: AUTHOR_TIER_MODEL,
  };
}
