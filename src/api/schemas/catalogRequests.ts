import { z } from 'zod';

export const CATALOG_REQUEST_STATUSES = [
  'pending',
  'reviewed',
  'accepted',
  'rejected',
  'fulfilled',
] as const;

export const catalogRequestSourceLanguages = ['en', 'ko', 'zh', 'ru'] as const;
export const catalogRequestTargetLanguages = ['ru', 'be'] as const;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

const optionalComment = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

export const catalogTranslationRequestCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  authorName: optionalTrimmed(200),
  sourceLanguage: z.enum(catalogRequestSourceLanguages).optional(),
  targetLanguage: z.enum(catalogRequestTargetLanguages),
  comment: optionalComment.refine((value) => value === undefined || value.length >= 5, {
    message: 'Comment must be at least 5 characters when provided',
  }),
  sourceUrl: z
    .string()
    .trim()
    .url()
    .max(2048)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export const adminTranslationRequestsListQuerySchema = z.object({
  status: z.enum(CATALOG_REQUEST_STATUSES).optional(),
  search: z.string().trim().max(200).optional(),
  targetLanguage: z.string().trim().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const adminTranslationRequestUpdateSchema = z.object({
  status: z.enum(CATALOG_REQUEST_STATUSES).optional(),
  adminNotes: z
    .union([z.string().max(5000), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }),
  linkedPublicationId: z
    .union([z.string().uuid(), z.literal(''), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === '') return null;
      return value;
    }),
});

export type CatalogTranslationRequestCreateBody = z.infer<
  typeof catalogTranslationRequestCreateSchema
>;
export type AdminTranslationRequestsListQuery = z.infer<
  typeof adminTranslationRequestsListQuerySchema
>;
export type AdminTranslationRequestUpdateBody = z.infer<typeof adminTranslationRequestUpdateSchema>;
