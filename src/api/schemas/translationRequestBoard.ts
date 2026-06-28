import { z } from 'zod';
import { CATALOG_REQUEST_STATUSES } from './catalogRequests.js';

export const CATALOG_INTEREST_STATUSES = ['interested', 'working', 'withdrawn'] as const;

const openBoardStatuses = ['pending', 'reviewed', 'accepted'] as const;

export const translationRequestBoardQuerySchema = z.object({
  status: z.enum(openBoardStatuses).optional(),
  search: z.string().trim().max(200).optional(),
  targetLanguage: z.string().trim().max(10).optional(),
  mine: z
    .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const translationRequestInterestCreateSchema = z.object({
  translatorEntityId: z.string().uuid(),
});

export const translationRequestInterestUpdateSchema = z.object({
  projectId: z.string().uuid().optional(),
  status: z.enum(CATALOG_INTEREST_STATUSES).optional(),
});

export type TranslationRequestBoardQuery = z.infer<typeof translationRequestBoardQuerySchema>;
export type TranslationRequestInterestCreateBody = z.infer<
  typeof translationRequestInterestCreateSchema
>;
export type TranslationRequestInterestUpdateBody = z.infer<
  typeof translationRequestInterestUpdateSchema
>;

/** Statuses visible on the author board */
export const BOARD_OPEN_REQUEST_STATUSES = openBoardStatuses;

/** Full status enum for admin moderation on board */
export const BOARD_ADMIN_STATUS_FILTER = CATALOG_REQUEST_STATUSES;
