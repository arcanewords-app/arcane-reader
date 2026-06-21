/**
 * Chapter translation critic prompts (prod Author+).
 */

import type { Language } from '../types/common.js';
import { languageDisplayName } from '../language.js';

export interface CriticUserPromptParams {
  numberedSource: string;
  numberedTranslation: string;
  glossaryText?: string;
}

export interface CriticSystemPromptOptions {
  maxIssues: number;
  targetLanguage: Language;
}

export function getChapterCriticSystemPrompt(options: CriticSystemPromptOptions): string {
  const lang = languageDisplayName(options.targetLanguage);
  const maxIssues = options.maxIssues;

  return `You are an Expert Literary Translation Reviewer.
Your task is to review a single ${lang} translation against the original source text.

You must evaluate using a simplified quality framework with these dimensions:
1. **accuracy** — meaning transfer (mistranslations, omissions, additions)
2. **fluency** — natural ${lang} prose (grammar, awkward phrasing)
3. **glossary** — names, terms, character gender consistency with the glossary
4. **style** — author's voice and register

## Severity levels (use exact tags)
- **CRITICAL** — wrong meaning, wrong gender/context, mandatory glossary violation
- **MAJOR** — distorted but understandable meaning, glaring grammar/style break
- Do NOT include MINOR issues unless truly noteworthy.

## Output rules
- Write \`summary\` and \`strengths\` in ${lang}.
- Write each issue \`description\` in ${lang}; quote the problematic phrase briefly.
- Return up to **${maxIssues}** issues — prioritize CRITICAL, then MAJOR; cover different paragraphIndex values when possible.
- \`paragraphIndex\` is **0-based**: [¶1] in the input = index 0, [¶2] = index 1, etc.
- Report only CRITICAL and MAJOR in \`issues\`.
- Do NOT output a rewritten full translation, scratchpad, or polished version.
- Output ONLY valid JSON matching the schema. No markdown outside JSON.`;
}

export function buildChapterCriticUserPrompt(params: CriticUserPromptParams): string {
  return `## Glossary
${params.glossaryText?.trim() || '(none)'}

## Original Text (Source)
${params.numberedSource}

## Translation
${params.numberedTranslation}

Review the translation and return the JSON.`;
}

/** Number paragraphs for critic prompts: [¶1] text */
export function numberParagraphsForCritic(texts: string[]): string {
  return texts.map((text, i) => `[¶${i + 1}] ${text}`).join('\n\n');
}

/** Build OpenAI strict JSON schema for chapter critic (dynamic maxItems). */
export function buildChapterCriticJsonSchema(maxIssues: number): Record<string, unknown> {
  const issueItem = {
    type: 'object',
    properties: {
      paragraphIndex: { type: 'integer' },
      dimension: {
        type: 'string',
        enum: ['accuracy', 'fluency', 'glossary', 'style'],
      },
      severity: {
        type: 'string',
        enum: ['CRITICAL', 'MAJOR', 'MINOR'],
      },
      description: { type: 'string' },
    },
    required: ['paragraphIndex', 'dimension', 'severity', 'description'],
    additionalProperties: false,
  };

  return {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      strengths: { type: 'string' },
      issues: {
        type: 'array',
        items: issueItem,
        maxItems: maxIssues,
      },
    },
    required: ['summary', 'strengths', 'issues'],
    additionalProperties: false,
  };
}
