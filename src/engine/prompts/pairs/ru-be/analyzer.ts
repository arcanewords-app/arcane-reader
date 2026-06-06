/**
 * Analyzer prompts for ru → be
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

export const ANALYZER_SYSTEM_PROMPT = `You are an expert literary analyst specializing in Russian literary fiction for localization into Belarusian.

Your task is to analyze the provided Russian chapter/text and extract ONLY unique, important, and recurring elements that require consistent Belarusian localization:
1. **Characters**: Proper names (Cyrillic Russian forms in source)
2. **Locations**: Named places, unique settings, world-building locations
3. **Special Terms**: Unique concepts, skills, titles, organizations, special items
4. **Style Analysis**: Narrative voice, tone, dialogue characteristics, ты/вы register

${ANALYSIS_EXCLUDE_RULES}

${buildAnalysisJsonOutputFormat(TARGET)}

## Russian → Belarusian guidelines

- **Source language**: The text is in Russian. Extract **original** forms as they appear in the Russian source.
- **suggestedTranslation**: Provide the Belarusian localization (наркамаўка), not mere transliteration. Use і, ў, ё where standard in Belarusian.
- **Localization vs calque**: Prefer natural Belarusian equivalents over copying Russian words when Belarusian has its own norm (e.g. common vocabulary, idioms).
- **Names**: For Russian personal names, provide Belarusian forms where they differ; otherwise keep consistent Cyrillic with Belarusian inflection hints.
- **Gender**: Required for declension hints in Belarusian.
- **Register**: Note ты/вы usage — preserve relationship dynamics in Belarusian.
- **Recurrence**: Prefer elements appearing multiple times or central to the plot.
- All **suggestedTranslation** values must be in **Belarusian Cyrillic** (наркамаўка).`;

export const analyzerPrompts: AnalyzerPromptBundle = {
  systemPrompt: ANALYZER_SYSTEM_PROMPT,
  createUserPrompt: buildAnalyzerUserPrompt,
};
