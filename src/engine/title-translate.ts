/**
 * Lightweight LLM translation for chapter titles (not part of 3-stage pipeline).
 */

import type { OpenAIProvider } from './providers/openai.js';
import type { Language } from './types/common.js';
import { languageDisplayName } from './language.js';
import { log } from './logger.js';
import { truncateChapterTitle } from '../shared/chapterTitle.js';

export interface TitleTranslateItem {
  chapterId: string;
  title: string;
}

export interface TitleTranslateResult {
  chapterId: string;
  translatedTitle: string;
}

const SYSTEM_PROMPT = `You translate chapter titles for a novel localization project.
Rules:
- Translate ONLY the title text into the target language.
- Preserve proper nouns using the glossary when provided.
- Keep titles concise (book/chapter heading style, not full sentences).
- Do not add quotes, chapter numbers, or prefixes unless they are part of the source title.
- Return valid JSON only.`;

function buildUserPrompt(
  items: TitleTranslateItem[],
  sourceLanguage: Language,
  targetLanguage: Language,
  glossaryText?: string
): string {
  const sourceLabel = languageDisplayName(sourceLanguage);
  const targetLabel = languageDisplayName(targetLanguage);
  const lines = items.map(
    (item, i) =>
      `${i + 1}. id="${item.chapterId}" title="${truncateChapterTitle(item.title).replace(/"/g, '\\"')}"`
  );
  let prompt = `Translate these chapter titles from ${sourceLabel} to ${targetLabel}.

Return JSON: { "items": [ { "chapterId": "<id>", "translatedTitle": "<translation>" } ] }
Use the same chapterId values. One entry per input title.

Titles:
${lines.join('\n')}`;
  if (glossaryText?.trim()) {
    prompt += `\n\n## Glossary (use for proper nouns)\n${glossaryText.trim()}`;
  }
  return prompt;
}

function parseBatchResponse(raw: unknown, items: TitleTranslateItem[]): TitleTranslateResult[] {
  const expectedIds = new Set(items.map((i) => i.chapterId));
  const results: TitleTranslateResult[] = [];

  if (!raw || typeof raw !== 'object') return results;
  const obj = raw as { items?: unknown };
  if (!Array.isArray(obj.items)) return results;

  for (const entry of obj.items) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { chapterId?: string; translatedTitle?: string };
    const chapterId = e.chapterId?.trim();
    const translatedTitle = e.translatedTitle?.trim();
    if (!chapterId || !translatedTitle || !expectedIds.has(chapterId)) continue;
    results.push({ chapterId, translatedTitle: truncateChapterTitle(translatedTitle) });
  }
  return results;
}

export async function translateChapterTitlesBatch(
  provider: OpenAIProvider,
  items: TitleTranslateItem[],
  options: {
    sourceLanguage: Language;
    targetLanguage: Language;
    glossaryText?: string;
    temperature?: number;
    isCancelled?: () => boolean;
  }
): Promise<{ results: TitleTranslateResult[]; tokensUsed: { total: number } }> {
  if (items.length === 0) return { results: [], tokensUsed: { total: 0 } };
  if (options.isCancelled?.()) return { results: [], tokensUsed: { total: 0 } };

  const userPrompt = buildUserPrompt(
    items,
    options.sourceLanguage,
    options.targetLanguage,
    options.glossaryText
  );

  let tokensUsed = 0;
  try {
    if (typeof provider.completeJSON === 'function') {
      const response = await provider.completeJSON<{ items: TitleTranslateResult[] }>(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        { temperature: options.temperature ?? 0.3 }
      );
      tokensUsed = response.tokensUsed?.total ?? 0;
      const results = parseBatchResponse(response.data, items);
      if (results.length > 0) return { results, tokensUsed: { total: tokensUsed } };
    }

    if (typeof provider.complete !== 'function') {
      throw new Error('Provider missing complete/completeJSON');
    }

    const response = await provider.complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { temperature: options.temperature ?? 0.3 }
    );
    tokensUsed = response.tokensUsed?.total ?? 0;
    const text = response.content?.trim() ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('Title translate: no JSON in response', { preview: text.slice(0, 120) });
      return { results: [], tokensUsed: { total: tokensUsed } };
    }
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    return { results: parseBatchResponse(parsed, items), tokensUsed: { total: tokensUsed } };
  } catch (err) {
    log.error('Title translate batch failed', { err, itemCount: items.length });
    throw err;
  }
}
