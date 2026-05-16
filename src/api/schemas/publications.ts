import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export const publicationsListQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  orderBy: z.enum(['created_at', 'published_at']).optional(),
  orderAsc: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
  author: z.string().optional(),
  translator: z.string().optional(),
  tag: z.string().optional(),
});

export const reportBodySchema = z.object({
  chapterId: z.string().min(1),
  description: z.string().trim().min(1),
});

export const readingPositionBodySchema = z.object({
  chapterId: z.string().min(1),
  paragraphIndex: z.number().int().min(0).optional(),
});

export const publishBodySchema = z
  .object({
    status: z.enum(['draft', 'published']).optional(),
    title: z.string().trim().nullable().optional(),
    description: z.string().trim().nullable().optional(),
    coverImageUrl: z.string().url().nullable().optional(),
    authorDisplay: z.string().trim().nullable().optional(),
    translatorDisplay: z.string().trim().nullable().optional(),
    authorEntityId: z.string().min(1).nullable().optional(),
    translatorEntityId: z.string().min(1).nullable().optional(),
    sourceLanguage: z.string().trim().max(20).optional(),
    targetLanguage: z.string().trim().max(20).optional(),
  })
  .passthrough();

export const buildExportsBodySchema = z.object({
  formats: z.array(z.enum(['epub', 'fb2'])).optional(),
});

export const publicationDownloadQuerySchema = z.object({
  format: z.enum(['epub', 'fb2']),
});

export const publicationDisplaySettingsBodySchema = z.object({
  showGlossary: z.boolean().optional(),
});

export type BuildExportsBody = z.infer<typeof buildExportsBodySchema>;
export type PublicationDownloadQuery = z.infer<typeof publicationDownloadQuerySchema>;
export type PublicationDisplaySettingsBody = z.infer<typeof publicationDisplaySettingsBodySchema>;
export type PublicationsListQuery = z.infer<typeof publicationsListQuerySchema>;
export type ReportBody = z.infer<typeof reportBodySchema>;
export type ReadingPositionBody = z.infer<typeof readingPositionBodySchema>;
export type PublishBody = z.infer<typeof publishBodySchema>;
