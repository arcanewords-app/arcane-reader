/**
 * User-facing execution preset labels for prod Settings (Standard / Advanced).
 * Maps to engine modes: chunked / one_shot.
 */

import type { EditExecutionMode } from './edit-execution-modes.js';
import type { TranslateExecutionMode } from './translate-execution-modes.js';

export type ExecutionPresetUiValue = TranslateExecutionMode | EditExecutionMode;

/** i18n key suffix under settings.executionPreset.{standard|advanced} */
export const EXECUTION_PRESET_UI_KEYS = {
  chunked: 'standard',
  one_shot: 'advanced',
} as const;

export function executionPresetI18nKey(mode: ExecutionPresetUiValue): string {
  return EXECUTION_PRESET_UI_KEYS[mode];
}

export function executionPresetHintI18nKey(mode: ExecutionPresetUiValue): string {
  return `${EXECUTION_PRESET_UI_KEYS[mode]}Hint`;
}
