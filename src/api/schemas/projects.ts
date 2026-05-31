import { z } from 'zod';

/** MVP translation source languages (engine whitelist). */
export const supportedSourceLanguageSchema = z.enum(['en', 'ko', 'zh']);

/** MVP translation target languages (engine whitelist). */
export const supportedTargetLanguageSchema = z.enum(['ru']);

export const projectCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(500),
  sourceLanguage: supportedSourceLanguageSchema.optional(),
  targetLanguage: supportedTargetLanguageSchema.optional(),
});

export const projectLanguagesBodySchema = z.object({
  sourceLanguage: supportedSourceLanguageSchema,
  targetLanguage: supportedTargetLanguageSchema,
});

export const projectSearchQuerySchema = z.object({
  q: z.string().optional().default(''),
  field: z.enum(['original', 'translated', 'both']).optional().default('translated'),
});

export const projectSettingsBodySchema = z
  .object({
    model: z.string().trim().max(200).optional(),
    stageModels: z
      .object({
        analysis: z.string().trim().max(200),
        translation: z.string().trim().max(200),
        editing: z.string().trim().max(200),
      })
      .optional(),
    temperature: z.number().min(0).max(2).optional(),
    temperatureByStage: z
      .object({
        analysis: z.number().min(0).max(2).optional(),
        translation: z.number().min(0).max(2).optional(),
        editing: z.number().min(0).max(2).optional(),
      })
      .optional(),
    enableAnalysis: z.boolean().optional(),
    enableTranslation: z.boolean().optional(),
    enableEditing: z.boolean().optional(),
    originalReadingMode: z.boolean().optional(),
    includeGlossaryInAnalysis: z.boolean().optional(),
    includeGlossaryInTranslation: z.boolean().optional(),
    includeGlossaryInEditing: z.boolean().optional(),
    textBlockTypes: z.array(z.unknown()).optional(),
    customInstructions: z
      .object({
        translation: z.string().optional(),
        editing: z.string().optional(),
      })
      .optional(),
    editingStylePreset: z.enum(['default', 'literary', 'minimal', 'ai_revivification']).optional(),
    editingFocus: z.enum(['fix_problems', 'style_only', 'both']).optional(),
    allowReasoningModelsForAnalysis: z.boolean().optional(),
  })
  .passthrough();

export const metadataUpdateBodySchema = z.object({
  metadata: z.record(z.string(), z.unknown()),
});

export const exportDownloadQuerySchema = z.object({
  path: z.string().min(1),
});

export type ProjectCreateBody = z.infer<typeof projectCreateBodySchema>;
export type ProjectLanguagesBody = z.infer<typeof projectLanguagesBodySchema>;
export type ProjectSearchQuery = z.infer<typeof projectSearchQuerySchema>;
export type ProjectSettingsBody = z.infer<typeof projectSettingsBodySchema>;
export type MetadataUpdateBody = z.infer<typeof metadataUpdateBodySchema>;
export type ExportDownloadQuery = z.infer<typeof exportDownloadQuerySchema>;
