import { z } from 'zod';
import { supportedSourceLanguageSchema, supportedTargetLanguageSchema } from './projects.js';

const paragraphStatusSchema = z.enum(['pending', 'translated', 'edited', 'approved']);

/** Optional per-job language pair override (ephemeral; does not update project). */
export const languagePairBodySchema = z.object({
  sourceLanguage: supportedSourceLanguageSchema,
  targetLanguage: supportedTargetLanguageSchema,
});

export const chapterIdsBodySchema = z.object({
  chapterIds: z.array(z.string().min(1)).min(1),
  languagePair: languagePairBodySchema.optional(),
  options: z
    .object({
      continueOnError: z.boolean().optional(),
    })
    .optional(),
});

export const translateBatchBodySchema = z.object({
  chapterIds: z.array(z.string().min(1)).min(1),
  translateOnlyEmpty: z.boolean().optional(),
  translateChapterTitles: z.boolean().optional(),
  languagePair: languagePairBodySchema.optional(),
  stages: z
    .union([z.literal('all'), z.array(z.enum(['analysis', 'translation', 'editing']))])
    .optional(),
});

export const chapterTranslateBodySchema = z.object({
  translateOnlyEmpty: z.boolean().optional(),
  translateChapterTitles: z.boolean().optional(),
  paragraphIds: z.array(z.string().min(1)).optional(),
  languagePair: languagePairBodySchema.optional(),
  stages: z
    .union([z.literal('all'), z.array(z.enum(['analysis', 'translation', 'editing']))])
    .optional(),
});

export const chapterTitleBodySchema = z.object({
  title: z.string().trim().min(1),
});

export const chapterNumberBodySchema = z.object({
  number: z.number().int().positive(),
});

export const chapterStatusBodySchema = z.object({
  status: z.enum(['pending', 'translating', 'analyzed', 'draft', 'partial', 'completed', 'error']),
});

export const chaptersOrderBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const paragraphBulkUpdateBodySchema = z.object({
  updates: z
    .array(
      z.object({
        chapterId: z.string().min(1),
        paragraphId: z.string().min(1),
        translatedText: z.string(),
      })
    )
    .min(1)
    .max(100),
});

export const paragraphUpdateBodySchema = z.object({
  translatedText: z.string().optional(),
  status: paragraphStatusSchema.optional(),
});

export const exportBodySchema = z.object({
  format: z.enum(['epub', 'fb2']),
  author: z.string().trim().max(500).optional(),
});

export type LanguagePairBody = z.infer<typeof languagePairBodySchema>;
export type ChapterIdsBody = z.infer<typeof chapterIdsBodySchema>;
export type TranslateBatchBody = z.infer<typeof translateBatchBodySchema>;
export type ChapterTranslateBody = z.infer<typeof chapterTranslateBodySchema>;
export type ChapterTitleBody = z.infer<typeof chapterTitleBodySchema>;
export type ChapterNumberBody = z.infer<typeof chapterNumberBodySchema>;
export type ChapterStatusBody = z.infer<typeof chapterStatusBodySchema>;
export type ChaptersOrderBody = z.infer<typeof chaptersOrderBodySchema>;
export type ParagraphBulkUpdateBody = z.infer<typeof paragraphBulkUpdateBodySchema>;
export type ParagraphUpdateBody = z.infer<typeof paragraphUpdateBodySchema>;
export const chapterCriticBodySchema = z.object({
  force: z.boolean().optional(),
});

export type ChapterCriticBody = z.infer<typeof chapterCriticBodySchema>;
