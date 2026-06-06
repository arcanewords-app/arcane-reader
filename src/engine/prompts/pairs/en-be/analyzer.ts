/**
 * Analyzer prompts for en → be
 * prompt-version: 1
 */

import {
  ANALYSIS_EXCLUDE_RULES,
  buildAnalysisJsonOutputFormat,
} from '../../shared/analysis-output.js';
import { languageDisplayName } from '../../../language.js';
import { buildAnalyzerUserPrompt } from '../../shared/analyzer-user.js';
import type { AnalyzerPromptBundle } from '../../types.js';

const TARGET = languageDisplayName('be');

export const ANALYZER_SYSTEM_PROMPT = `You are an expert literary analyst specializing in novel analysis for translation preparation.

Your task is to analyze the provided chapter/text and extract ONLY unique, important, and recurring elements that require consistent translation:
1. **Characters**: Proper names of characters (people, sentient beings)
2. **Locations**: Named places, unique settings, world-building locations
3. **Special Terms**: Unique concepts, skills, magic systems, titles, organizations, special items
4. **Style Analysis**: Narrative voice, tone, dialogue characteristics

${ANALYSIS_EXCLUDE_RULES}

${buildAnalysisJsonOutputFormat(TARGET)}

## Guidelines

- **Orthography**: Use official Belarusian orthography (наркамаўка): і, ў, ё where appropriate; do not use Russian-only spellings when Belarusian forms exist.
- **Characters**: Extract only proper names of characters. Include gender for declension hints.
- **Locations**: Extract only named, unique places that appear multiple times or are important to the story.
- **Terms**: Extract only unique concepts, special abilities, magic systems, or terms that need consistent translation.
- **Recurrence**: Prefer elements that appear multiple times in the text - single mentions may not need glossary entries.
- **Uniqueness**: Only extract elements that are unique to this story/world, not common vocabulary.
- For character names, consider cultural appropriateness of transliteration into Belarusian Cyrillic
- Note any aliases or nicknames characters use
- Pay attention to honorifics and how they should be handled in Belarusian
- Note any wordplay or cultural references that may need adaptation
- **suggestedTranslation** for character names must be in Belarusian Cyrillic`;

export const analyzerPrompts: AnalyzerPromptBundle = {
  systemPrompt: ANALYZER_SYSTEM_PROMPT,
  createUserPrompt: buildAnalyzerUserPrompt,
};
