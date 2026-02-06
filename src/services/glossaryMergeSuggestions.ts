/**
 * Glossary merge suggestions: call LLM to analyze glossary and suggest
 * groups of entries that can be merged (duplicates, aliases).
 * Used by POST /api/projects/:id/glossary/suggest-merges.
 */

import type { GlossaryEntry } from '../storage/database.js';

export interface MergeSuggestion {
  /** 2–3 entry IDs that can be merged into one */
  entryIds: string[];
  /** Short reason for the suggestion (for UI) */
  reason: string;
  /** Which entry ID to keep as primary (optional) */
  suggestedPrimaryId?: string;
}

const SYSTEM_PROMPT = `You are an expert editor analyzing a translation glossary for a novel or text.

Your task: find groups of entries that likely refer to the SAME entity and could be merged into one.

Rules:
- Only suggest merging entries of the SAME type (character with character, location with location, term with term).
- Each group must contain 2 or 3 entries maximum.
- Suggest only when you are confident: same character (full name + nickname, or duplicate), same place (different spellings), same term (duplicate or alias).
- Be conservative: when in doubt, do NOT suggest a merge.
- Return valid JSON only, no markdown or extra text.

Output format (strict):
{
  "suggestions": [
    {
      "entryIds": ["id1", "id2"],
      "reason": "Brief reason in 1 sentence",
      "suggestedPrimaryId": "id1"
    }
  ]
}

- entryIds: array of 2-3 entry IDs from the input list (exact ids).
- reason: short explanation for the user (e.g. "Same character: full name and nickname").
- suggestedPrimaryId: (optional) which entry to keep; must be one of entryIds. If omitted, the app will choose.`;

function buildGlossaryPayload(entries: GlossaryEntry[]): Array<Record<string, unknown>> {
  return entries.map((e) => {
    const row: Record<string, unknown> = {
      id: e.id,
      type: e.type,
      original: e.original,
      translated: e.translated,
    };
    if (e.description?.trim()) row.description = e.description.trim();
    if (e.mentionedInChapters?.length) row.mentionedInChapters = e.mentionedInChapters;
    if (e.type === 'character' && e.gender) row.gender = e.gender;
    return row;
  });
}

/**
 * Validate and filter suggestions: only keep those where all entryIds exist in glossary,
 * have same type, and length >= 2. Normalize entryIds to unique and filter suggestedPrimaryId.
 */
function validateSuggestions(
  raw: { suggestions?: Array<{ entryIds?: string[]; reason?: string; suggestedPrimaryId?: string }> },
  glossary: GlossaryEntry[]
): MergeSuggestion[] {
  const idSet = new Set(glossary.map((e) => e.id));
  const byId = new Map(glossary.map((e) => [e.id, e]));
  const result: MergeSuggestion[] = [];

  const list = Array.isArray(raw.suggestions) ? raw.suggestions : [];
  for (const s of list) {
    let entryIds = Array.isArray(s.entryIds) ? [...s.entryIds] : [];
    entryIds = [...new Set(entryIds)].filter((id) => idSet.has(id));
    if (entryIds.length < 2) continue;

    const types = entryIds.map((id) => byId.get(id)!.type);
    const sameType = types.every((t) => t === types[0]);
    if (!sameType) continue;

    let suggestedPrimaryId: string | undefined;
    if (s.suggestedPrimaryId && entryIds.includes(s.suggestedPrimaryId)) {
      suggestedPrimaryId = s.suggestedPrimaryId;
    }

    result.push({
      entryIds,
      reason: typeof s.reason === 'string' && s.reason.trim() ? s.reason.trim() : 'Same entity',
      suggestedPrimaryId,
    });
  }

  return result;
}

export interface SuggestMergesOptions {
  apiKey: string;
  model?: string;
  /** Request timeout in ms. Default 120000 (2 min). */
  timeout?: number;
}

/**
 * Call LLM to get merge suggestions. Returns validated suggestions only.
 * Returns [] if glossary has < 2 entries, or on parse/LLM error.
 */
export async function suggestGlossaryMerges(
  glossary: GlossaryEntry[],
  options: SuggestMergesOptions
): Promise<MergeSuggestion[]> {
  if (glossary.length < 2) {
    return [];
  }

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({
    apiKey: options.apiKey,
    timeout: options.timeout ?? 120000,
  });
  const model = options.model ?? 'gpt-4.1-mini';

  const payload = buildGlossaryPayload(glossary);
  const userMessage = `Analyze this glossary and suggest which entries can be merged (same character/location/term). Return JSON with "suggestions" array.

Glossary entries (JSON):
${JSON.stringify(payload, null, 0)}`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as {
      suggestions?: Array<{ entryIds?: string[]; reason?: string; suggestedPrimaryId?: string }>;
    };
    return validateSuggestions(parsed, glossary);
  } catch (err) {
    console.error('[glossaryMergeSuggestions] LLM or parse error:', err);
    return [];
  }
}
