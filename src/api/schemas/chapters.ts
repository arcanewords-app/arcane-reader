import { z } from 'zod';

const paragraphStatusSchema = z.enum(['pending', 'translated', 'edited', 'approved']);

export const chapterIdsBodySchema = z.object({
  chapterIds: z.array(z.string().min(1)).min(1),
  options: z
    .object({
      continueOnError: z.boolean().optional(),
    })
    .optional(),
});

export const translateBatchBodySchema = z.object({
  chapterIds: z.array(z.string().min(1)).min(1),
  translateOnlyEmpty: z.boolean().optional(),
  stages: z
    .union([
      z.literal('all'),
      z.array(z.enum(['analysis', 'translation', 'editing'])),
    ])
    .optional(),
});

export const chapterTitleBodySchema = z.object({
  title: z.string().trim().min(1),
});

export const chapterNumberBodySchema = z.object({
  number: z.number().int().positive(),
});

export const chapterStatusBodySchema = z.object({
  status: z.enum(['pending', 'translating', 'analyzed', 'draft', 'completed', 'error']),
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
    .min(1),
});

export const paragraphUpdateBodySchema = z.object({
  translatedText: z.string().optional(),
  status: paragraphStatusSchema.optional(),
});

export const exportBodySchema = z.object({
  format: z.enum(['epub', 'fb2']),
  author: z.string().trim().max(500).optional(),
});

export type ChapterIdsBody = z.infer<typeof chapterIdsBodySchema>;
export type TranslateBatchBody = z.infer<typeof translateBatchBodySchema>;
export type ChapterTitleBody = z.infer<typeof chapterTitleBodySchema>;
export type ChapterNumberBody = z.infer<typeof chapterNumberBodySchema>;
export type ChapterStatusBody = z.infer<typeof chapterStatusBodySchema>;
export type ChaptersOrderBody = z.infer<typeof chaptersOrderBodySchema>;
export type ParagraphBulkUpdateBody = z.infer<typeof paragraphBulkUpdateBodySchema>;
export type ParagraphUpdateBody = z.infer<typeof paragraphUpdateBodySchema>;
export type ExportBody = z.infer<typeof exportBodySchema>;
