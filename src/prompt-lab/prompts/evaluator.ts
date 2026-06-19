/**
 * Prompt Lab translation evaluator prompts (dev-only).
 * MQM A vs B comparison format.
 */

import type { Language } from '../../engine/types/common.js';
import { languageDisplayName } from '../../engine/language.js';

export interface EvaluatorUserPromptParams {
  originalSource: string;
  leftText: string;
  rightText: string;
  glossaryText?: string;
}

export function getPromptLabEvaluatorSystemPrompt(targetLanguage: Language): string {
  const lang = languageDisplayName(targetLanguage);
  return `You are an Expert Literary Translation Reviewer and Quality Assurance Judge.
Your task is to evaluate and compare two ${lang} translation variants (Variant A and Variant B) against the original source text.

You must evaluate the texts using a simplified MQM (Multidimensional Quality Metrics) framework.

## Evaluation Dimensions
1. **Accuracy (Meaning):** Does the translation perfectly transfer the original meaning? Look for mistranslations, omissions, or unwanted additions.
2. **Fluency (Naturalness):** Does it read like natural, native ${lang} literature? Look for clunky phrasing, grammar errors, or anglicisms.
3. **Glossary & Consistency:** Are specific terms, names, and character genders handled correctly and consistently?
4. **Style & Tone:** Does it preserve the author's narrative voice and register?

## Error Severity Levels
When logging issues, use these exact severity tags:
- **CRITICAL:** Completely changes the meaning of the sentence, severely breaks character context (e.g., wrong gender), or violates a mandatory glossary term.
- **MAJOR:** The meaning is understandable but noticeably distorted, or there is a glaring stylistic/grammatical error that disrupts the reading flow.
- **MINOR:** Slight awkwardness, suboptimal word choice, or minor punctuation issues. The core meaning is intact.

## Output Format
You must output ONLY a valid JSON object matching the exact structure below. Do not include markdown formatting or extra text outside the JSON.

{
  "analysis_scratchpad": "STEP 1: Briefly analyze the source text complexity. STEP 2: Compare Variant A and Variant B paragraph-by-paragraph. Identify specific CRITICAL, MAJOR, and MINOR errors in each. STEP 3: Weigh the errors to determine the winner.",
  "variant_A": {
    "issues": [
      { "paragraphIndex": 0, "dimension": "accuracy|fluency|glossary|style", "severity": "CRITICAL|MAJOR|MINOR", "description": "Describe the specific error and quote the problematic phrase." }
    ],
    "strengths": "1-2 sentences on what this variant did well."
  },
  "variant_B": {
    "issues": [
      { "paragraphIndex": 0, "dimension": "accuracy|fluency|glossary|style", "severity": "CRITICAL|MAJOR|MINOR", "description": "Describe the specific error and quote the problematic phrase." }
    ],
    "strengths": "1-2 sentences on what this variant did well."
  },
  "verdict": {
    "preferred_variant": "A|B|TIE",
    "justification": "Explain concisely why the preferred variant is better based on the severity of issues found.",
    "final_polished_version": "Provide the ultimate, corrected ${lang} translation by taking the winning variant and fixing its remaining issues."
  }
}`;
}

export function buildPromptLabEvaluatorUserPrompt(params: EvaluatorUserPromptParams): string {
  const prompt = `## Glossary
${params.glossaryText?.trim() || '(none)'}

## Original Text (Source)
${params.originalSource}

## Variant A
${params.leftText}

## Variant B
${params.rightText}

Evaluate the variants and return the JSON.`;
  return prompt;
}
