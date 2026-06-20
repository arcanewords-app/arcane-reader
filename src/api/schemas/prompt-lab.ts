import { z } from 'zod';
import { normalizeEditingFocus } from '../../shared/editing-focus.js';

const languageSchema = z.enum(['en', 'ko', 'zh', 'ru', 'be']);
const stageSchema = z.enum(['analyze', 'translate', 'edit']);
const presetSchema = z.enum(['default', 'literary', 'minimal', 'ai_revivification']);
const focusInputSchema = z.enum([
  'fix_only',
  'polish',
  'elevate',
  'fix_problems',
  'style_only',
  'both',
]);
const focusSchema = focusInputSchema.transform((v) => normalizeEditingFocus(v));

const glossarySnapshotSchema = z
  .array(
    z.object({
      type: z.enum(['character', 'location', 'term']).default('term'),
      original: z.string(),
      translated: z.string().optional(),
      gender: z.enum(['male', 'female', 'neutral', 'unknown']).optional(),
      description: z.string().optional(),
      notes: z.string().optional(),
      declensions: z
        .object({
          nominative: z.string(),
          genitive: z.string(),
          dative: z.string(),
          accusative: z.string(),
          instrumental: z.string(),
          prepositional: z.string(),
        })
        .optional(),
    })
  )
  .optional();

export const promptLabCurrentQuerySchema = z.object({
  stage: stageSchema,
  source: languageSchema,
  target: languageSchema,
  preset: presetSchema.optional(),
  focus: focusSchema.optional(),
});

export const promptLabPreviewBodySchema = z.object({
  stage: stageSchema,
  sourceLanguage: languageSchema,
  targetLanguage: languageSchema,
  sourceText: z.string(),
  translatedText: z.string().optional(),
  glossarySnapshot: glossarySnapshotSchema,
  chapterNumber: z.number().int().positive().optional(),
  includeGlossary: z.boolean().optional(),
  customInstructions: z.string().optional(),
  preset: presetSchema.optional(),
  focus: focusSchema.optional(),
});

const reasoningEffortSchema = z.enum(['low', 'medium', 'high']);

const executionModeSchema = z
  .enum(['one_shot', 'chunked', 'fast', 'standard', 'enhanced'])
  .transform((v) =>
    v === 'enhanced' ? 'one_shot' : v === 'fast' || v === 'standard' ? 'chunked' : v
  );

export const promptLabRunBodySchema = promptLabPreviewBodySchema.extend({
  model: z.string().trim().max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  reasoningEffort: reasoningEffortSchema.optional(),
  systemPromptOverride: z.string().optional(),
  userPromptOverride: z.string().optional(),
  chunkSize: z.number().int().positive().optional(),
  analysisMaxSectionTokens: z.number().int().min(0).optional(),
  enableTranslateFewShot: z.boolean().optional(),
  enableTranslateCoT: z.boolean().optional(),
  enableTranslateStructuredCoT: z.boolean().optional(),
  translateLeadingContextParagraphs: z.number().int().min(0).max(4).optional(),
  miniModelTranslationProfile: z.boolean().optional(),
  forceChunked: z.boolean().optional(),
  translateExecutionMode: executionModeSchema.optional(),
  editExecutionMode: executionModeSchema.optional(),
  /** @deprecated */
  translateQualityPreset: executionModeSchema.optional(),
  /** @deprecated */
  editQualityPreset: executionModeSchema.optional(),
  runLabel: z.string().trim().max(80).optional(),
  saveRun: z.boolean().optional(),
  textId: z.string().uuid().optional(),
  promptId: z.string().uuid().optional().nullable(),
});

export const promptLabRunPatchSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
});

const compareModeSchema = z.enum(['source', 'output']);

export const promptLabEvaluateBodySchema = z.object({
  leftRunId: z.string().uuid(),
  rightRunId: z.string().uuid(),
  leftMode: compareModeSchema.default('output'),
  rightMode: compareModeSchema.default('output'),
  referenceRunId: z.string().uuid().optional(),
  model: z.string().trim().max(200).optional(),
  reasoningEffort: reasoningEffortSchema.optional(),
  glossarySnapshot: glossarySnapshotSchema,
});

export const promptLabTextBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  sourceLanguage: languageSchema,
  targetLanguage: languageSchema,
  stageHint: z.string().trim().max(50).optional(),
  content: z.string(),
  translatedText: z.string().optional(),
  glossarySnapshot: glossarySnapshotSchema,
});

export const promptLabPromptBodySchema = z.object({
  stage: stageSchema,
  sourceLanguage: languageSchema,
  targetLanguage: languageSchema,
  name: z.string().trim().min(1).max(200),
  systemPrompt: z.string().min(1),
  userPromptOverride: z.string().optional().nullable(),
  preset: presetSchema.optional().nullable(),
  focus: focusSchema.optional().nullable(),
  origin: z.enum(['seed', 'manual']).optional(),
});

export const promptLabGlossaryImportSchema = z.object({
  content: z.string().min(1),
  filename: z.string().optional(),
});
