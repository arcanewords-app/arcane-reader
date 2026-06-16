/**
 * Ephemeral single-stage runner for Prompt Lab (no production DB writes).
 */

import { loadConfig } from '../config.js';
import {
  AnalyzeStage,
  TranslateStage,
  EditStage,
  OpenAIProvider,
  GlossaryManager,
  filterGlossaryByChapter,
  filterGlossaryForChunk,
  getChapterCastCharacters,
  resolvePrompts,
  getEffectiveStagePrompts,
  createEditorPrompt,
  languageDisplayName,
  assertSupportedPair,
  type Language,
  type StageType,
} from '../engine/index.js';
import type { GlossaryImportEntry } from '../api/schemas/glossary.js';
import type { EditingFocus, EditingStylePreset } from '../engine/prompts/system/editor.js';
import { createLabAgentContext, portableEntriesToGlossary } from './glossary.js';
import type { PromptLabRunInputSnapshot, PromptLabRunOutput } from './types.js';

export interface PreviewUserPromptInput {
  stage: StageType;
  sourceLanguage: Language;
  targetLanguage: Language;
  sourceText: string;
  translatedText?: string;
  glossarySnapshot?: GlossaryImportEntry[];
  chapterNumber?: number;
  includeGlossary?: boolean;
  customInstructions?: string;
  preset?: EditingStylePreset;
  focus?: EditingFocus;
}

export interface RunStageInput extends PreviewUserPromptInput {
  model?: string;
  temperature?: number;
  systemPromptOverride?: string;
  userPromptOverride?: string;
  chunkSize?: number;
  analysisMaxSectionTokens?: number;
}

const LAB_CHUNK_SIZE = 100_000;

export function previewUserPrompt(input: PreviewUserPromptInput): string {
  assertSupportedPair(input.sourceLanguage, input.targetLanguage);
  const glossary = portableEntriesToGlossary(input.glossarySnapshot);
  const chapterNumber = input.chapterNumber ?? 1;
  const includeGlossary = input.includeGlossary !== false;
  const targetLabel = languageDisplayName(input.targetLanguage);

  if (input.stage === 'analyze') {
    let glossaryText = '';
    if (includeGlossary && glossary) {
      glossaryText = new GlossaryManager(glossary).toPromptText({
        targetLanguageLabel: targetLabel,
      });
    }
    return resolvePrompts('analyze', input.sourceLanguage, input.targetLanguage).createUserPrompt({
      sourceText: input.sourceText,
      sourceLanguageLabel: languageDisplayName(input.sourceLanguage),
      targetLanguageLabel: targetLabel,
      existingGlossary: glossaryText || undefined,
    });
  }

  if (input.stage === 'translate') {
    const ctx = createLabAgentContext(input.sourceLanguage, input.targetLanguage, glossary);
    const chapterGlossary = filterGlossaryByChapter(ctx.glossary, chapterNumber);
    const glossaryText =
      includeGlossary && chapterGlossary
        ? new GlossaryManager(
            filterGlossaryForChunk(input.sourceText, chapterGlossary, 'source')
          ).toPromptText({ targetLanguageLabel: targetLabel })
        : '';
    const cast = GlossaryManager.toCastPromptText(
      getChapterCastCharacters(chapterGlossary, chapterNumber)
    );
    const contextParts: string[] = [];
    if (cast) contextParts.push(cast);
    return resolvePrompts('translate', input.sourceLanguage, input.targetLanguage).createUserPrompt(
      {
        sourceText: input.sourceText,
        sourceLanguageLabel: languageDisplayName(input.sourceLanguage),
        targetLanguageLabel: targetLabel,
        glossary: glossaryText,
        context: contextParts.join('\n'),
        styleGuide: '',
        customInstructions: input.customInstructions,
      }
    );
  }

  const chapterGlossary = filterGlossaryByChapter(glossary, chapterNumber);
  const translated = input.translatedText ?? '';
  const glossaryText =
    includeGlossary && chapterGlossary
      ? new GlossaryManager(
          filterGlossaryForChunk(translated, chapterGlossary, 'target')
        ).toEditPromptText({ targetLanguageLabel: targetLabel })
      : '';
  const chapterCast = GlossaryManager.toEditCastPromptText(
    getChapterCastCharacters(chapterGlossary, chapterNumber)
  );
  return createEditorPrompt(
    translated,
    glossaryText,
    '',
    input.customInstructions,
    targetLabel,
    chapterCast
  );
}

export async function runPromptLabStage(input: RunStageInput): Promise<PromptLabRunOutput> {
  assertSupportedPair(input.sourceLanguage, input.targetLanguage);

  const appConfig = loadConfig();
  const model = input.model?.trim() || appConfig.openai.model;
  const provider = new OpenAIProvider({ apiKey: appConfig.openai.apiKey, model });

  const effective = getEffectiveStagePrompts(
    input.stage,
    input.sourceLanguage,
    input.targetLanguage,
    {
      preset: input.preset,
      focus: input.focus,
    }
  );
  const systemPrompt = input.systemPromptOverride ?? effective.systemPrompt;
  const defaultUser = previewUserPrompt(input);
  const userPrompt = input.userPromptOverride ?? defaultUser;

  const glossary = portableEntriesToGlossary(input.glossarySnapshot);
  const chapterNumber = input.chapterNumber ?? 1;

  if (input.stage === 'analyze') {
    const stage = new AnalyzeStage(provider);
    const result = await stage.execute(input.sourceText, {
      chapterNumber,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      existingGlossary: input.includeGlossary !== false ? glossary : undefined,
      temperature: input.temperature ?? 0.3,
      maxSectionTokens: input.analysisMaxSectionTokens ?? 0,
      systemPromptOverride: systemPrompt,
      userPromptOverride: userPrompt,
    });
    return {
      stage: 'analyze',
      success: result.success,
      error: result.error,
      analysis: result.data,
      tokensUsed: result.tokensUsed,
      durationMs: result.duration,
      prompts: { system: systemPrompt, user: userPrompt },
    };
  }

  if (input.stage === 'translate') {
    const ctx = createLabAgentContext(input.sourceLanguage, input.targetLanguage, glossary);
    const stage = new TranslateStage(provider);
    const result = await stage.execute(input.sourceText, {
      context: ctx,
      chunkSize: input.chunkSize ?? LAB_CHUNK_SIZE,
      temperature: input.temperature ?? 0.7,
      includeGlossary: input.includeGlossary !== false,
      customInstructions: input.customInstructions,
      chapterNumber,
      systemPromptOverride: systemPrompt,
      userPromptOverride: userPrompt,
      neverSplitParagraphs: true,
    });
    return {
      stage: 'translate',
      success: result.success,
      error: result.error,
      text: result.data?.translatedText,
      tokensUsed: result.tokensUsed,
      durationMs: result.duration,
      prompts: { system: systemPrompt, user: userPrompt },
    };
  }

  const translatedText = input.translatedText?.trim() ?? '';
  if (!translatedText) {
    return {
      stage: 'edit',
      success: false,
      error: 'translatedText is required for edit stage',
      tokensUsed: 0,
      durationMs: 0,
      prompts: { system: systemPrompt, user: userPrompt },
    };
  }

  const ctx = createLabAgentContext(input.sourceLanguage, input.targetLanguage, glossary);
  const stage = new EditStage(provider);
  const result = await stage.execute(translatedText, input.sourceText, {
    context: ctx,
    temperature: input.temperature ?? 0.5,
    includeGlossary: input.includeGlossary !== false,
    customInstructions: input.customInstructions,
    editingStylePreset: input.preset ?? 'default',
    editingFocus: input.focus ?? 'both',
    chapterNumber,
    systemPromptOverride: systemPrompt,
    userPromptOverride: userPrompt,
  });

  return {
    stage: 'edit',
    success: result.success,
    error: result.error,
    text: result.data?.finalText,
    tokensUsed: result.tokensUsed,
    durationMs: result.duration,
    prompts: { system: systemPrompt, user: userPrompt },
  };
}

export function buildInputSnapshot(
  input: RunStageInput,
  prompts: { system: string; user: string }
): PromptLabRunInputSnapshot {
  return {
    sourceText: input.sourceText,
    translatedText: input.translatedText,
    glossarySnapshot: input.glossarySnapshot,
    systemPrompt: prompts.system,
    userPrompt: prompts.user,
  };
}
