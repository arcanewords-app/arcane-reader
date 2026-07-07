import { z } from 'zod';

export const profileUpdateBodySchema = z.object({
  avatarUrl: z
    .union([z.string().url(), z.literal(''), z.null()])
    .transform((v) => (v === '' ? null : v)),
});

export const tokenUsageQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const tokenUsageHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export type ProfileUpdateBody = z.infer<typeof profileUpdateBodySchema>;
export type TokenUsageQuery = z.infer<typeof tokenUsageQuerySchema>;
export const translatorPseudonymListQuerySchema = z.object({
  includeHidden: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

export const translatorPseudonymCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export const translatorPseudonymUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value !== undefined && value.length > 0 ? value : null)),
  photoUrl: z.string().trim().url().max(2048).nullable().optional(),
});

export type TranslatorPseudonymListQuery = z.infer<typeof translatorPseudonymListQuerySchema>;
export type TranslatorPseudonymCreateBody = z.infer<typeof translatorPseudonymCreateSchema>;
export type TranslatorPseudonymUpdateBody = z.infer<typeof translatorPseudonymUpdateSchema>;
