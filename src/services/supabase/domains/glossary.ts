/**
 * Extracted from supabaseDatabase.ts
 */

import { createClientWithToken } from '../../supabaseClient.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import type { GlossaryEntry } from '../../../storage/database.js';
import {
  transformGlossaryEntryFromDB,
  normalizeGlossaryTypeForDB,
  normalizeGenderForDB,
} from '../../supabaseTransforms.js';
import { transformGlossaryEntryToDB } from '../transforms/glossary.js';

/**
 * Get a single glossary entry by id (for merging chapter appearance).
 * @param options.useServiceRole - Use service role client (for long-running ops when JWT may expire)
 */
export async function getGlossaryEntry(
  projectId: string,
  entryId: string,
  token: string,
  options?: { useServiceRole?: boolean }
): Promise<GlossaryEntry | null> {
  const useServiceRole = options?.useServiceRole === true;
  if (!useServiceRole) {
    validateToken(token);
  }
  const client = useServiceRole
    ? (await import('../../supabaseClient.js')).createServiceRoleClient()
    : createClientWithToken(token);

  const { data: row, error } = await client
    .from('glossary_entries')
    .select('*')
    .eq('project_id', projectId)
    .eq('id', entryId)
    .single();

  if (error || !row) {
    return null;
  }

  return transformGlossaryEntryFromDB(row);
}

/**
 * Add a glossary entry to a project
 * Note: Token is required for RLS authentication
 * @param options.useServiceRole - Use service role client (for long-running ops when JWT may expire)
 * @throws {Error} If token is required but not provided
 */
export async function addGlossaryEntry(
  projectId: string,
  entry: Omit<GlossaryEntry, 'id'>,
  token: string,
  options?: { useServiceRole?: boolean }
): Promise<GlossaryEntry | undefined> {
  const useServiceRole = options?.useServiceRole === true;
  if (!useServiceRole) {
    validateToken(token);
  }
  const client = useServiceRole
    ? (await import('../../supabaseClient.js')).createServiceRoleClient()
    : createClientWithToken(token);

  // Verify project exists (RLS will ensure user has access)
  const { data: project, error: projectError } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return undefined;
  }

  const entryData = transformGlossaryEntryToDB(entry, { projectId });

  const { data: newEntry, error } = await client
    .from('glossary_entries')
    .insert(entryData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add glossary entry: ${error.message}`);
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  return transformGlossaryEntryFromDB(newEntry);
}

const GLOSSARY_BATCH_INSERT_SIZE = 100;

/**
 * Batch insert glossary entries (import).
 */
export async function importGlossaryEntriesBatch(
  projectId: string,
  entries: Omit<GlossaryEntry, 'id'>[],
  token: string
): Promise<GlossaryEntry[]> {
  validateToken(token);
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const client = createClientWithToken(token);

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return [];
  }

  const inserted: GlossaryEntry[] = [];

  for (let offset = 0; offset < entries.length; offset += GLOSSARY_BATCH_INSERT_SIZE) {
    const chunk = entries.slice(offset, offset + GLOSSARY_BATCH_INSERT_SIZE);
    const rows = chunk.map((entry) => transformGlossaryEntryToDB(entry, { projectId }));

    const { data: newEntries, error } = await client.from('glossary_entries').insert(rows).select();

    if (error) {
      throw new Error(`Failed to import glossary batch: ${error.message}`);
    }

    if (newEntries?.length) {
      inserted.push(...newEntries.map(transformGlossaryEntryFromDB));
    }
  }

  await client.from('projects').update({}).eq('id', projectId);

  return inserted;
}

/**
 * Update a glossary entry
 * @param options.useServiceRole - Use service role client (for long-running ops when JWT may expire)
 */
export async function updateGlossaryEntry(
  projectId: string,
  entryId: string,
  updates: Partial<GlossaryEntry>,
  token: string,
  options?: { useServiceRole?: boolean }
): Promise<GlossaryEntry | undefined> {
  const useServiceRole = options?.useServiceRole === true;
  if (!useServiceRole) {
    validateToken(token);
  }
  const client = useServiceRole
    ? (await import('../../supabaseClient.js')).createServiceRoleClient()
    : createClientWithToken(token);

  // Get current entry to merge imageUrls if needed
  const { data: currentEntry } = await client
    .from('glossary_entries')
    .select('*')
    .eq('id', entryId)
    .eq('project_id', projectId)
    .single();

  if (!currentEntry) {
    return undefined;
  }

  // Handle imageUrls migration (legacy support)
  let imageUrls = updates.imageUrls || currentEntry.image_urls || [];
  if (updates.imageUrl && !imageUrls.includes(updates.imageUrl)) {
    imageUrls = [updates.imageUrl, ...imageUrls];
  }

  const entryData: Record<string, unknown> = {};
  if (updates.type !== undefined) entryData.type = normalizeGlossaryTypeForDB(updates.type);
  if (updates.original !== undefined) entryData.original = updates.original;
  if (updates.translated !== undefined) entryData.translated = updates.translated;
  if (updates.gender !== undefined) entryData.gender = normalizeGenderForDB(updates.gender);
  if (updates.declensions !== undefined) entryData.declensions = updates.declensions || null;
  if (updates.description !== undefined) entryData.description = updates.description || null;
  if (updates.notes !== undefined) entryData.notes = updates.notes || null;
  if (updates.firstAppearance !== undefined)
    entryData.first_appearance = updates.firstAppearance || null;
  if (updates.mentionedInChapters !== undefined)
    entryData.mentioned_in_chapters = updates.mentionedInChapters?.length
      ? updates.mentionedInChapters
      : null;
  if (updates.relatedEntryIds !== undefined)
    entryData.related_entry_ids = updates.relatedEntryIds?.length ? updates.relatedEntryIds : null;
  if (updates.primaryLocationId !== undefined)
    entryData.primary_location_id = updates.primaryLocationId || null;
  if (imageUrls.length > 0 || updates.imageUrls !== undefined) entryData.image_urls = imageUrls;
  if (updates.autoDetected !== undefined) entryData.auto_detected = updates.autoDetected;

  const { data: updatedEntry, error } = await client
    .from('glossary_entries')
    .update(entryData)
    .eq('id', entryId)
    .eq('project_id', projectId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return undefined; // Not found
    }
    throw new Error(`Failed to update glossary entry: ${error.message}`);
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  return transformGlossaryEntryFromDB(updatedEntry);
}

/**
 * Delete a glossary entry
 * Note: Token is required for RLS authentication
 * @throws {Error} If token is required but not provided
 */
export async function deleteGlossaryEntry(
  projectId: string,
  entryId: string,
  token: string
): Promise<boolean> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { error } = await client
    .from('glossary_entries')
    .delete()
    .eq('id', entryId)
    .eq('project_id', projectId);

  if (error) {
    throw new Error(`Failed to delete glossary entry: ${error.message}`);
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  return true;
}

/**
 * Delete multiple glossary entries in one request
 * @returns Number of entries deleted
 */
export async function deleteGlossaryEntriesBulk(
  projectId: string,
  entryIds: string[],
  token: string
): Promise<number> {
  if (entryIds.length === 0) return 0;
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('glossary_entries')
    .delete()
    .eq('project_id', projectId)
    .in('id', entryIds)
    .select('id');

  if (error) {
    throw new Error(`Failed to bulk delete glossary entries: ${error.message}`);
  }

  const deletedCount = data?.length ?? 0;
  if (deletedCount > 0) {
    await client.from('projects').update({}).eq('id', projectId);
  }
  return deletedCount;
}
