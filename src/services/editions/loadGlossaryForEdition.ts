/**
 * TODO(glossary-edition): replace with a glossary stored per target language.
 * Do not write analysis merges into glossary_entries for a non-primary target.
 */
import { loadGlossaryForProject, loadGlossaryForProjectPublic } from '../supabase/loaders.js';
import { blankGlossaryTranslations } from './editionLanguage.js';
import type { GlossaryEntry } from '../../storage/database.js';

export async function loadGlossaryForEdition(
  projectId: string,
  targetLanguage: string,
  token: string,
  primaryLanguage: string,
  options?: { useServiceRole?: boolean }
): Promise<GlossaryEntry[]> {
  const entries = options?.useServiceRole
    ? await loadGlossaryForProjectPublic(projectId)
    : await loadGlossaryForProject(projectId, token);
  if (!targetLanguage || targetLanguage === primaryLanguage) return entries;
  return blankGlossaryTranslations(entries);
}
