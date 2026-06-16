/**
 * Prompt Lab translation evaluator prompts (dev-only).
 */

import type { Language } from '../../engine/types/common.js';
import { languageDisplayName } from '../../engine/language.js';

export interface EvaluatorUserPromptParams {
  sourceLanguage: Language;
  targetLanguage: Language;
  originalSource: string;
  leftText: string;
  rightText: string;
  leftLabel: string;
  rightLabel: string;
  glossaryText?: string;
  compareMode: 'review' | 'compare_outputs';
}

export function getPromptLabEvaluatorSystemPrompt(targetLanguage: Language): string {
  const lang = languageDisplayName(targetLanguage);
  return `You are a senior literary translation reviewer for Prompt Lab (dev tool).
Evaluate translation quality for ${lang} target text.

Score dimensions (1-10 each):
- accuracy: meaning fidelity to the original
- fluency: natural ${lang} prose
- glossary: consistent use of provided terms/names
- style: tone, register, and narrative voice match

When the text has multiple paragraphs, review it paragraph-by-paragraph and reference paragraph indices in issues.
When comparing two translation variants, judge which better serves the reader while staying faithful to the source.

Output JSON only:
{
  "score": 8,
  "dimensions": { "accuracy": 8, "fluency": 9, "glossary": 7, "style": 8 },
  "issues": [{ "paragraphIndex": 0, "severity": "major|minor", "text": "description" }],
  "suggestions": ["actionable suggestion"],
  "summary": "2-3 sentence overall assessment"
}`;
}

export function buildPromptLabEvaluatorUserPrompt(params: EvaluatorUserPromptParams): string {
  const targetLabel = languageDisplayName(params.targetLanguage);
  const sourceLabel = languageDisplayName(params.sourceLanguage);

  let prompt = `## Task
Review ${targetLabel} translation quality for Prompt Lab.

## Original (${sourceLabel})
${params.originalSource}

## Left panel — ${params.leftLabel}
${params.leftText}

## Right panel — ${params.rightLabel}
${params.rightText}
`;

  if (params.glossaryText?.trim()) {
    prompt += `\n## Reference Glossary\n${params.glossaryText.trim()}\n`;
  }

  if (params.compareMode === 'compare_outputs') {
    prompt += `\nBoth panels contain translation variants (not the original). Compare them against the original source above. Score reflects the **right panel** variant; mention where the left panel is stronger or weaker.\n`;
  } else {
    prompt += `\nLeft panel is the original source; right panel is the candidate translation. Score the **right panel** translation.\n`;
  }

  prompt += `\nReturn JSON as specified in the system prompt.`;
  return prompt;
}
