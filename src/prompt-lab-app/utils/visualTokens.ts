import type { LabLanguage, LabStage } from '../api/client';
import { LLM_MODELS } from '../../shared/llmModels.js';

export type ChipStage = LabStage;
export type ChipVariant = 'stage' | 'model' | 'lang' | 'preset' | 'origin' | 'status' | 'neutral';

export const STAGE_CHIP_CLASS: Record<LabStage, string> = {
  analyze: 'pl-chip--stage-analyze',
  translate: 'pl-chip--stage-translate',
  edit: 'pl-chip--stage-edit',
};

export const STAGE_STRIPE_CLASS: Record<LabStage, string> = {
  analyze: 'pl-run-card--stage-analyze',
  translate: 'pl-run-card--stage-translate',
  edit: 'pl-run-card--stage-edit',
};

/** Deterministic hue 0–360 for a model id string. */
export function modelHue(modelId: string): number {
  let hash = 0;
  for (let i = 0; i < modelId.length; i++) {
    hash = (hash * 31 + modelId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function modelChipStyle(modelId: string): Record<string, string> {
  const hue = modelHue(modelId);
  return { '--pl-chip-hue': String(hue) };
}

export function modelLabel(modelId: string): string {
  const found = LLM_MODELS.find((m) => m.value === modelId);
  if (found) return found.label;
  if (!modelId || modelId === 'default') return 'default';
  return modelId;
}

export function langPairLabel(source: LabLanguage, target: LabLanguage): string {
  return `${source}→${target}`;
}

export function langPairKey(source: LabLanguage, target: LabLanguage): string {
  return `${source}→${target}`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTokenCount(n: number): string {
  return n.toLocaleString();
}
