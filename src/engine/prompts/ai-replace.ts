/**
 * AI smart replace prompts for project search (minimal paragraph edits).
 */

import type { Language } from '../types/common.js';
import { languageDisplayName } from '../language.js';
import {
  PARA_MARKER_PREFIX,
  PARA_MARKER_SUFFIX,
  type ParsedParagraphMarker,
} from '../utils/para-markers.js';
import type { AiReplacePresetId } from '../../shared/aiReplacePresets.js';
import { buildPresetInstruction } from '../../shared/aiReplacePresets.js';

export interface AiReplaceParagraphInput {
  paragraphId: string;
  translatedText: string;
}

export interface AiReplaceUserPromptParams {
  preset: AiReplacePresetId;
  targetLanguage: Language;
  find: string;
  replaceHint?: string;
  detail?: string;
  glossaryText?: string;
  paragraphs: AiReplaceParagraphInput[];
}

export interface AiReplaceParagraphOutput {
  id: string;
  text: string;
}

export interface AiReplaceModelResult {
  paragraphs: AiReplaceParagraphOutput[];
}

export function markParagraphsForAiReplace(paragraphs: AiReplaceParagraphInput[]): string {
  return paragraphs
    .map(
      (p) => `${PARA_MARKER_PREFIX}${p.paragraphId}${PARA_MARKER_SUFFIX}${p.translatedText ?? ''}`
    )
    .join('\n\n');
}

export function getAiReplaceSystemPrompt(targetLanguage: Language): string {
  const lang = languageDisplayName(targetLanguage);
  return `You are a precise literary translation editor for ${lang} text.

Your task: apply a minimal, targeted edit to specific paragraphs. You receive paragraphs marked with \`--para:{id}--\` at the start of each block.

## Rules
- Change ONLY text related to the task and the search fragment provided.
- Return the FULL corrected text of each paragraph you modify (not a diff).
- If a paragraph needs no change, omit it from the output.
- Do NOT rewrite style, tone, or sentence structure beyond the required fix.
- Do NOT add or remove sentences.
- Preserve \`{{block:...}}\` and \`{{/block:...}}\` markers exactly (same count, same order, same ids).
- Do NOT alter \`--para:...--\` markers in the output JSON id field.
- Output ONLY valid JSON matching the schema. No markdown outside JSON.`;
}

export function buildAiReplaceUserPrompt(params: AiReplaceUserPromptParams): string {
  const lang = languageDisplayName(params.targetLanguage);
  const presetInstruction = buildPresetInstruction(params.preset, lang);
  const marked = markParagraphsForAiReplace(params.paragraphs);

  const lines = [`## Task`, presetInstruction, ``, `## Search fragment`, params.find];

  if (params.replaceHint?.trim()) {
    lines.push(``, `## Target form (canonical)`, params.replaceHint.trim());
  }

  if (params.detail?.trim()) {
    lines.push(``, `## Additional note from editor`, params.detail.trim());
  }

  lines.push(
    ``,
    `## Glossary (relevant entries)`,
    params.glossaryText?.trim() || '(none)',
    ``,
    `## Paragraphs to edit`,
    marked,
    ``,
    `Return JSON with only paragraphs that need changes. Each "id" must match the marker from the input (e.g. "--para:uuid--"). Each "text" is the full corrected paragraph without the marker.`
  );

  return lines.join('\n');
}

export function buildAiReplaceJsonSchema(maxParagraphs: number): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      paragraphs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['id', 'text'],
          additionalProperties: false,
        },
        maxItems: maxParagraphs,
      },
    },
    required: ['paragraphs'],
    additionalProperties: false,
  };
}

const BLOCK_MARKER_RE = /\{\{block:[^}]+\}\}|\{\{\/block:[^}]+\}\}/g;

export function extractBlockMarkers(text: string): string[] {
  return text.match(BLOCK_MARKER_RE) ?? [];
}

export function blockMarkersPreserved(before: string, after: string): boolean {
  const b = extractBlockMarkers(before);
  const a = extractBlockMarkers(after);
  if (b.length !== a.length) return false;
  return b.every((m, i) => m === a[i]);
}

/** Iterative Levenshtein edit distance. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array<number>(cols);
  let curr = new Array<number>(cols);

  for (let j = 0; j < cols; j++) prev[j] = j;

  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[cols - 1];
}

/** Fraction of characters that differ (0 = identical). */
export function paragraphChangeRatio(before: string, after: string): number {
  if (before === after) return 0;
  const maxLen = Math.max(before.length, after.length, 1);
  return levenshteinDistance(before, after) / maxLen;
}

/** Reject if edit distance ratio exceeds threshold (full rewrite guard). */
export function changeRatioTooHigh(before: string, after: string, maxRatio = 0.4): boolean {
  return paragraphChangeRatio(before, after) > maxRatio;
}

export function normalizeAiReplaceOutputId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(PARA_MARKER_PREFIX) && trimmed.endsWith(PARA_MARKER_SUFFIX)) {
    return trimmed.slice(PARA_MARKER_PREFIX.length, -PARA_MARKER_SUFFIX.length);
  }
  return trimmed.replace(/^--para:/, '').replace(/--$/, '') || null;
}

export function parseAiReplaceModelResult(data: AiReplaceModelResult): ParsedParagraphMarker[] {
  if (!Array.isArray(data.paragraphs)) return [];
  return data.paragraphs
    .map((row) => {
      const id = normalizeAiReplaceOutputId(row.id ?? '');
      const text = typeof row.text === 'string' ? row.text.trim() : '';
      if (!id || !text) return null;
      return { id, text };
    })
    .filter((p): p is ParsedParagraphMarker => p !== null);
}
