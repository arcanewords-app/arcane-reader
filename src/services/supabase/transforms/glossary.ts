/**
 * Glossary entry DB row mapping — extracted from supabaseDatabase for unit testing.
 */

import type { GlossaryEntry } from '../../../storage/database.js';
import { normalizeGenderForDB, normalizeGlossaryTypeForDB } from '../../supabaseTransforms.js';

export interface GlossaryEntryToDBOptions {
  projectId: string;
  /** Remap chapter numbers when transferring between projects */
  mentionedInChapters?: number[] | null;
  /** Override translated text (transfer may fall back to source entry) */
  translated?: string;
  /** Override gender from source entry on transfer */
  gender?: GlossaryEntry['gender'];
  /** Skip image URLs on transfer clone */
  imageUrls?: string[];
}

/**
 * Map a glossary entry (domain) to a DB insert/update row.
 * Unifies 5+ inline mappings in clone, transfer, and CRUD paths.
 */
export function transformGlossaryEntryToDB(
  entry: Omit<GlossaryEntry, 'id'> | Partial<GlossaryEntry>,
  options: GlossaryEntryToDBOptions
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    project_id: options.projectId,
    type: normalizeGlossaryTypeForDB(entry.type),
    original: entry.original,
    translated: options.translated ?? entry.translated,
    gender: normalizeGenderForDB(options.gender ?? entry.gender),
    declensions: entry.declensions || null,
    description: entry.description || null,
    notes: entry.notes || null,
    first_appearance: entry.firstAppearance || null,
    mentioned_in_chapters:
      options.mentionedInChapters !== undefined
        ? options.mentionedInChapters
        : (entry.mentionedInChapters ?? null),
    image_urls: options.imageUrls ?? entry.imageUrls ?? [],
    auto_detected: entry.autoDetected || false,
  };

  if (entry.relatedEntryIds?.length) {
    row.related_entry_ids = entry.relatedEntryIds;
  }
  if (entry.primaryLocationId) {
    row.primary_location_id = entry.primaryLocationId;
  }

  return row;
}

/**
 * Clone path: insert row without related IDs (patched in a second pass).
 */
export function transformGlossaryEntryForCloneInsert(
  entry: GlossaryEntry,
  projectId: string
): Record<string, unknown> {
  return transformGlossaryEntryToDB(entry, {
    projectId,
    imageUrls: entry.imageUrls || [],
  });
}
