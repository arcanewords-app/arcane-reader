import { z } from 'zod';

export const newsCategories = ['feature', 'discount', 'update', 'other'] as const;
export const newsStatuses = ['draft', 'published', 'archived'] as const;
export const announcementVariants = ['info', 'promo', 'neutral'] as const;
export const announcementMinRoles = [
  'guest',
  'user',
  'author',
  'author_plus',
  'super_author',
  'admin',
] as const;

export const newsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  category: z.enum(newsCategories).optional(),
});

export const newsCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(300),
  body: z.string().max(50_000).optional().default(''),
  category: z.enum(newsCategories).optional().default('other'),
  slug: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => {
      if (!v || v.length === 0) return null;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) {
        throw new Error('Invalid slug');
      }
      return v;
    }),
});

export const newsUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().min(1).max(300).optional(),
  body: z.string().max(50_000).optional(),
  category: z.enum(newsCategories).optional(),
  status: z.enum(newsStatuses).optional(),
  slug: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || v.length === 0) return null;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) {
        throw new Error('Invalid slug');
      }
      return v;
    }),
});

export const announcementCreateSchema = z.object({
  newsPostId: z.string().uuid().optional().nullable(),
  message: z.string().trim().max(160).optional().nullable(),
  ctaLabel: z.string().trim().max(60).optional().nullable(),
  ctaUrl: z.string().trim().max(500).optional().nullable(),
  variant: z.enum(announcementVariants).optional().default('info'),
  minRole: z.enum(announcementMinRoles).optional().default('guest'),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional().default(true),
  priority: z.coerce.number().int().min(-100).max(100).optional().default(0),
  dismissible: z.boolean().optional().default(true),
});

export const announcementUpdateSchema = z.object({
  message: z.string().trim().max(160).nullable().optional(),
  ctaLabel: z.string().trim().max(60).nullable().optional(),
  ctaUrl: z.string().trim().max(500).nullable().optional(),
  variant: z.enum(announcementVariants).optional(),
  minRole: z.enum(announcementMinRoles).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
  priority: z.coerce.number().int().min(-100).max(100).optional(),
  contentVersion: z.coerce.number().int().min(1).optional(),
  dismissible: z.boolean().optional(),
  newsPostId: z.string().uuid().nullable().optional(),
});

export const announcementFromNewsSchema = announcementCreateSchema.omit({ newsPostId: true });

export const announcementDismissSchema = z.object({
  contentVersion: z.coerce.number().int().min(1),
});

export type NewsListQuery = z.infer<typeof newsListQuerySchema>;
export type NewsCreateBody = z.infer<typeof newsCreateSchema>;
export type NewsUpdateBody = z.infer<typeof newsUpdateSchema>;
export type AnnouncementCreateBody = z.infer<typeof announcementCreateSchema>;
export type AnnouncementUpdateBody = z.infer<typeof announcementUpdateSchema>;
export type AnnouncementFromNewsBody = z.infer<typeof announcementFromNewsSchema>;
export type AnnouncementDismissBody = z.infer<typeof announcementDismissSchema>;
