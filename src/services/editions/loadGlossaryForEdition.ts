/**
 * Primary language reads glossary_entries. A second language overlays
 * glossary_translations and leaves missing forms blank.
 */
import { loadGlossaryForProject, loadGlossaryForProjectPublic } from '../supabase/loaders.js';
import { listGlossaryTranslationForms } from '../supabase/domains/editions.js';
import { overlayGlossaryTranslations } from './editionLanguage.js';
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
  const forms = await listGlossaryTranslationForms(projectId, targetLanguage, token, options);
  return overlayGlossaryTranslations(entries, forms);
}
