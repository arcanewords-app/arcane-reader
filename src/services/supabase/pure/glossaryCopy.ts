/**
 * Unified glossary copy row builders — extracted from supabaseDatabase clone/transfer paths.
 */

import type { GlossaryEntry } from '../../../storage/database.js';
import { glossaryEntryKey } from '../../glossaryImportExport.js';
import {
  transformGlossaryEntryForCloneInsert,
  transformGlossaryEntryToDB,
} from '../transforms/glossary.js';
import { remapMentionedInChapters } from './cloneErrors.js';

export const CLONE_GLOSSARY_BATCH_SIZE = 100;

/**
 * Build insert rows for cloning glossary entries (full copy, images patched later).
 */
export function buildGlossaryCloneInsertRows(
  entries: GlossaryEntry[],
  projectId: string
): Record<string, unknown>[] {
  return entries.map((entry) => transformGlossaryEntryForCloneInsert(entry, projectId));
}

/**
 * Build insert rows for transferring new glossary entries into a target project.
 */
export function buildGlossaryTransferInsertRows(
  toInsert: Array<Omit<GlossaryEntry, 'id'> & { translated?: string }>,
  sourceGlossary: GlossaryEntry[],
  targetProjectId: string,
  chapterNumberMap: Map<number, number>
): Record<string, unknown>[] {
  return toInsert.map((entry) => {
    const sourceEntry = sourceGlossary.find(
      (e) =>
        glossaryEntryKey(e.type, e.original) ===
        glossaryEntryKey(entry.type ?? 'term', entry.original)
    );
    return transformGlossaryEntryToDB(entry, {
      projectId: targetProjectId,
      translated: entry.translated ?? sourceEntry?.translated ?? entry.original,
      gender: entry.gender ?? sourceEntry?.gender,
      mentionedInChapters: remapMentionedInChapters(
        sourceEntry?.mentionedInChapters,
        chapterNumberMap
      ),
      imageUrls: [],
    });
  });
}

/**
 * Map old glossary entry IDs to existing target IDs (by type+original key).
 */
export function buildGlossaryIdMapFromExisting(
  sourceGlossary: GlossaryEntry[],
  targetGlossary: GlossaryEntry[]
): Map<string, string> {
  const glossaryIdMap = new Map<string, string>();
  const targetKeyToId = new Map(
    targetGlossary.map((entry) => [glossaryEntryKey(entry.type, entry.original), entry.id])
  );

  for (const entry of sourceGlossary) {
    const existingId = targetKeyToId.get(glossaryEntryKey(entry.type, entry.original));
    if (existingId) {
      glossaryIdMap.set(entry.id, existingId);
    }
  }

  return glossaryIdMap;
}
