/**
 * Analyzer prompts for en → ru
 * prompt-version: 1
 */

import {
  ANALYSIS_EXCLUDE_RULES,
  ANALYSIS_JSON_OUTPUT_FORMAT,
} from '../../shared/analysis-output.js';
import { buildAnalyzerUserPrompt } from '../../shared/analyzer-user.js';
import type { AnalyzerPromptBundle } from '../../types.js';

export const ANALYZER_SYSTEM_PROMPT = `You are an expert literary analyst specializing in novel analysis for translation preparation.

Your task is to analyze the provided chapter/text and extract ONLY unique, important, and recurring elements that require consistent translation:
1. **Characters**: Proper names of characters (people, sentient beings)
2. **Locations**: Named places, unique settings, world-building locations
3. **Special Terms**: Unique concepts, skills, magic systems, titles, organizations, special items
4. **Style Analysis**: Narrative voice, tone, dialogue characteristics

${ANALYSIS_EXCLUDE_RULES}

${ANALYSIS_JSON_OUTPUT_FORMAT}

## Guidelines

- **Characters**: Extract only proper names of characters. Include gender for proper Russian declension.
- **Locations**: Extract only named, unique places that appear multiple times or are important to the story.
- **Terms**: Extract only unique concepts, special abilities, magic systems, or terms that need consistent translation.
- **Recurrence**: Prefer elements that appear multiple times in the text - single mentions may not need glossary entries.
- **Uniqueness**: Only extract elements that are unique to this story/world, not common vocabulary.
- For character names, consider cultural appropriateness of transliteration into Cyrillic
- Note any aliases or nicknames characters use
- Pay attention to honorifics and how they should be handled in Russian
- Note any wordplay or cultural references that may need adaptation
- **suggestedTranslation** for character names must be in Cyrillic when target is Russian`;

export const analyzerPrompts: AnalyzerPromptBundle = {
  systemPrompt: ANALYZER_SYSTEM_PROMPT,
  createUserPrompt: buildAnalyzerUserPrompt,
};

/** @deprecated Use resolvePrompts('analyze', 'en', 'ru') */
export const createAnalyzerPrompt = (
  sourceText: string,
  sourceLanguage: string,
  targetLanguage: string,
  existingGlossary?: string
): string =>
  buildAnalyzerUserPrompt({
    sourceText,
    sourceLanguageLabel: sourceLanguage,
    targetLanguageLabel: targetLanguage,
    existingGlossary,
  });
