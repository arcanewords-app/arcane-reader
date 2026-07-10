import { z } from 'zod';

export const publicEntityKinds = ['tag', 'author', 'translator'] as const;

export const publicEntityCreateSchema = z.object({
  kind: z.enum(publicEntityKinds),
  name: z.string().trim().min(1).max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  photoUrl: z.string().trim().url().max(2048).optional(),
});

export const publicEntityListQuerySchema = z.object({
  kind: z.enum(publicEntityKinds).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const publicEntityUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value !== undefined && value.length > 0 ? value : null)),
  photoUrl: z.string().trim().url().max(2048).nullable().optional(),
});

export const reportStatusSchema = z.object({
  status: z.enum(['pending', 'reviewed', 'resolved']),
});

export type PublicEntityCreateBody = z.infer<typeof publicEntityCreateSchema>;
export type PublicEntityListQuery = z.infer<typeof publicEntityListQuerySchema>;
export type PublicEntityUpdateBody = z.infer<typeof publicEntityUpdateSchema>;
export type ReportStatusBody = z.infer<typeof reportStatusSchema>;

const publicationStatuses = ['draft', 'published', 'unpublished'] as const;

export const adminPublicationsListQuerySchema = z.object({
  status: z.enum(publicationStatuses).optional(),
  search: z.string().trim().max(200).optional(),
  targetLanguage: z.string().trim().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const adminUsersListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const adminUserRoleUpdateSchema = z.object({
  role: z.enum(['user', 'author', 'author_plus', 'super_author', 'admin']),
});

const adminProjectPublicationStatuses = ['draft', 'published', 'unpublished', 'none'] as const;

export const adminProjectsListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  publicationStatus: z.enum(adminProjectPublicationStatuses).optional(),
  targetLanguage: z.string().trim().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type AdminPublicationsListQuery = z.infer<typeof adminPublicationsListQuerySchema>;
export type AdminUsersListQuery = z.infer<typeof adminUsersListQuerySchema>;
export type AdminUserRoleUpdateBody = z.infer<typeof adminUserRoleUpdateSchema>;
export type AdminProjectsListQuery = z.infer<typeof adminProjectsListQuerySchema>;
