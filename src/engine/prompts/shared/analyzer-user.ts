import type { AnalyzerUserPromptParams } from '../types.js';
import { buildGlossaryMetadataLanguageRule } from './glossary-metadata-language.js';

export function buildAnalyzerUserPrompt(params: AnalyzerUserPromptParams): string {
  let prompt = `Analyze the following ${params.sourceLanguageLabel} text for translation to ${params.targetLanguageLabel}.\n\n`;

  if (params.existingGlossary) {
    prompt += `## Existing Glossary (for reference)\n${params.existingGlossary}\n\n`;
    prompt += `Rules:\n`;
    prompt += `- In "characters", "locations", "terms" list ONLY NEW entities that are not in the glossary above.\n`;
    prompt += `- If an entity from the glossary appears in this chapter and you have refined or new data (better description, improved translation), add it to "updatedCharacters", "updatedLocations", or "updatedTerms" with the exact original name/term. Only include fields you want to update.\n\n`;
  }

  prompt += `${buildGlossaryMetadataLanguageRule(params.targetLanguageLabel)}\n\n`;

  prompt += `## Source Text\n\n${params.sourceText}\n\n`;
  prompt += `Provide your analysis in the JSON format specified.`;

  return prompt;
}
