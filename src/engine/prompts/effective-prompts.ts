/**
 * Baseline system prompts as composed by pipeline stages (for Prompt Lab preview).
 */

import type { Language } from '../types/common.js';
import type { StageType } from '../types/pipeline.js';
import { languageDisplayName } from '../language.js';
import { resolvePrompts } from './registry.js';
import { buildGlossaryMetadataLanguageRule } from './shared/glossary-metadata-language.js';
import { appendGenderAgreement } from './shared/gender-agreement.js';
import {
  getEditorSystemPrompt,
  normalizeEditingFocus,
  type EditingFocus,
  type EditingStylePreset,
} from './system/editor.js';

export interface EffectiveStagePromptOptions {
  preset?: EditingStylePreset;
  focus?: EditingFocus;
}

export interface EffectiveStagePrompts {
  systemPrompt: string;
  stage: StageType;
  sourceLanguage: Language;
  targetLanguage: Language;
  preset?: EditingStylePreset;
  focus?: EditingFocus;
}

/**
 * Returns the effective system prompt for a stage (same composition as stage execute()).
 */
export function getEffectiveStagePrompts(
  stage: StageType,
  source: Language,
  target: Language,
  opts?: EffectiveStagePromptOptions
): EffectiveStagePrompts {
  const targetLabel = languageDisplayName(target);

  if (stage === 'analyze') {
    const bundle = resolvePrompts('analyze', source, target);
    const metadataLanguageRule = buildGlossaryMetadataLanguageRule(targetLabel);
    return {
      stage,
      sourceLanguage: source,
      targetLanguage: target,
      systemPrompt: `${bundle.systemPrompt}\n\n${metadataLanguageRule}`,
    };
  }

  if (stage === 'translate') {
    const bundle = resolvePrompts('translate', source, target);
    return {
      stage,
      sourceLanguage: source,
      targetLanguage: target,
      systemPrompt: appendGenderAgreement(bundle.systemPrompt, target),
    };
  }

  const preset = opts?.preset ?? 'default';
  const focus = normalizeEditingFocus(opts?.focus);
  return {
    stage,
    sourceLanguage: source,
    targetLanguage: target,
    preset,
    focus,
    systemPrompt: getEditorSystemPrompt(preset, focus, target),
  };
}
