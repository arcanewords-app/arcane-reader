/**
 * Auto-generate display names for Prompt Lab runs.
 * Format: {stage}_{model}_{promptName}[_{userLabel}]
 */

import type { PromptLabStage } from './types.js';

export function sanitizeRunNamePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

export function buildRunDisplayName(input: {
  stage: PromptLabStage;
  model?: string;
  promptName?: string | null;
  userLabel?: string | null;
}): string {
  const parts = [
    sanitizeRunNamePart(input.stage),
    sanitizeRunNamePart(input.model?.trim() || 'default'),
    sanitizeRunNamePart(input.promptName?.trim() || 'baseline'),
  ];
  const label = input.userLabel?.trim();
  if (label) parts.push(sanitizeRunNamePart(label));
  return parts.filter(Boolean).join('_');
}
