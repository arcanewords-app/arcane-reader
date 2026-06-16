/**
 * Convert portable glossary entries to engine Glossary + AgentContext for Prompt Lab runs.
 */

import type { GlossaryImportEntry } from '../api/schemas/glossary.js';
import type { AgentContext, StyleProfile } from '../engine/types/agent.js';
import type { Glossary } from '../engine/types/glossary.js';
import type { Language } from '../engine/types/common.js';
import { GlossaryManager } from '../engine/glossary/glossary-manager.js';
import type { GlossaryExportPortableEntry } from '../services/glossaryImportExport.js';

const EMPTY_STYLE: StyleProfile = {
  tone: '',
  narrativeVoice: '',
  dialogueStyle: '',
  writingStyle: '',
  targetAudience: '',
};

function minimalDeclensions(name: string) {
  return {
    nominative: name,
    genitive: name,
    dative: name,
    accusative: name,
    instrumental: name,
    prepositional: name,
  };
}

export function portableEntriesToGlossary(
  entries: GlossaryExportPortableEntry[] | GlossaryImportEntry[] | undefined,
  novelId = 'prompt-lab'
): Glossary {
  const manager = GlossaryManager.createEmpty(novelId);
  const glossary = manager.getData();

  if (!entries?.length) {
    return glossary;
  }

  for (const entry of entries) {
    const type = entry.type ?? 'term';
    if (type === 'character') {
      const translated = entry.translated?.trim() || entry.original;
      glossary.characters.push({
        id: crypto.randomUUID(),
        originalName: entry.original,
        translatedName: translated,
        declensions: entry.declensions ?? minimalDeclensions(translated),
        gender: entry.gender ?? 'unknown',
        description: entry.description ?? '',
        aliases: [],
        firstAppearance: 1,
        isMainCharacter: false,
      });
    } else if (type === 'location') {
      glossary.locations.push({
        id: crypto.randomUUID(),
        originalName: entry.original,
        translatedName: entry.translated?.trim() || entry.original,
        description: entry.description ?? '',
        type: 'other',
      });
    } else {
      glossary.terms.push({
        id: crypto.randomUUID(),
        originalTerm: entry.original,
        translatedTerm: entry.translated?.trim() || entry.original,
        description: [entry.description, 'notes' in entry ? entry.notes : undefined]
          .filter(Boolean)
          .join(' ')
          .trim(),
        category: 'other',
      });
    }
  }

  return glossary;
}

export function createLabAgentContext(
  sourceLanguage: Language,
  targetLanguage: Language,
  glossary: Glossary
): AgentContext {
  return {
    sourceLanguage,
    targetLanguage,
    glossary,
    styleProfile: EMPTY_STYLE,
    previousChapters: [],
    currentContext: {
      lastEvents: [],
      activeCharacters: [],
      currentLocation: '',
      currentMood: '',
      openPlotThreads: [],
    },
  };
}
