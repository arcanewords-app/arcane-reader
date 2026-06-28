import { z } from 'zod';
import { idSchema, uuidSchema } from './schemas/common.js';

/** Single UUID path param `:id` */
export const idParamSchema = z.object({ id: uuidSchema });

/** Project id path param */
export const projectIdParamSchema = z.object({ id: uuidSchema });

/** Nested project + chapter */
export const projectChapterParamsSchema = z.object({
  projectId: uuidSchema,
  chapterId: uuidSchema,
});

export const projectIdOnlyParamSchema = z.object({ projectId: uuidSchema });

/** Publication routes */
export const publicationIdParamSchema = z.object({ id: uuidSchema });

export const publicationChapterParamsSchema = z.object({
  id: uuidSchema,
  chapterId: uuidSchema,
});

/** Slug or opaque id for public news routes (`:idOrSlug`) */
export const idOrSlugParamSchema = z.object({ idOrSlug: idSchema });

export const newsIdParamSchema = z.object({ id: uuidSchema });

export const entityIdParamSchema = z.object({ id: uuidSchema });

export const adminUserRoleParamsSchema = z.object({ id: uuidSchema });

export const announcementIdParamSchema = z.object({ id: uuidSchema });

export const importJobParamsSchema = z.object({
  id: uuidSchema,
  jobId: idSchema,
});

export const targetProjectParamsSchema = z.object({ targetProjectId: uuidSchema });

export const promptLabIdParamSchema = z.object({ id: idSchema });
