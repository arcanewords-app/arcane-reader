import { z } from 'zod';

const glossaryTypeSchema = z.enum(['character', 'location', 'term']);
const genderSchema = z.enum(['male', 'female', 'neutral', 'unknown']);

const declensionsSchema = z
  .object({
    nominative: z.string(),
    genitive: z.string(),
    dative: z.string(),
    accusative: z.string(),
    instrumental: z.string(),
    prepositional: z.string(),
  })
  .optional();

export const glossaryCreateBodySchema = z.object({
  original: z.string().trim().min(1),
  translated: z.string().optional(),
  type: glossaryTypeSchema.optional().default('term'),
  gender: genderSchema.optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  declensions: declensionsSchema.optional(),
  firstAppearance: z.number().int().positive().optional(),
  relatedEntryIds: z.array(z.string().min(1)).optional(),
  primaryLocationId: z.string().min(1).optional(),
});

export const glossaryUpdateBodySchema = z.object({
  original: z.string().trim().min(1).optional(),
  translated: z.string().optional(),
  type: glossaryTypeSchema.optional(),
  gender: genderSchema.optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  declensions: declensionsSchema.optional(),
  relatedEntryIds: z.array(z.string().min(1)).optional(),
  primaryLocationId: z.string().min(1).optional(),
});

export const glossaryMergeBodySchema = z.object({
  entryIds: z.array(z.string().min(1)).min(2),
  keepEntryId: z.string().min(1).optional(),
});

export const glossaryBulkDeleteBodySchema = z.object({
  entryIds: z.array(z.string().min(1)).min(1),
});

export type GlossaryCreateBody = z.infer<typeof glossaryCreateBodySchema>;
export type GlossaryBulkDeleteBody = z.infer<typeof glossaryBulkDeleteBodySchema>;
export type GlossaryUpdateBody = z.infer<typeof glossaryUpdateBodySchema>;
export type GlossaryMergeBody = z.infer<typeof glossaryMergeBodySchema>;
