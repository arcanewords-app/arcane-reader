import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const idSchema = z.string().min(1).max(64);

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const dateQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Optional HTTP(S) URL; empty string → undefined */
export const optionalUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .optional()
  .or(z.literal(''))
  .transform((value) => (value && value.length > 0 ? value : undefined));
