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
export type TokenUsageHistoryQuery = z.infer<typeof tokenUsageHistoryQuerySchema>;
