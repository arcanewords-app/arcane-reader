/**
 * Draft a news post locale from the Russian canonical text.
 * This is not the chapter translation pipeline: no glossary, no chunking.
 */

import { z } from 'zod';
import type { NewsTranslationLocale } from '../shared/appLocales.js';
import { logger } from '../logger.js';

const LOCALE_NAMES: Record<NewsTranslationLocale, string> = {
  en: 'English',
  be: 'Belarusian',
  pl: 'Polish',
};

const draftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(300),
  body: z.string().max(50_000),
});

export interface DraftNewsTranslationInput {
  title: string;
  summary: string;
  body: string;
  targetLocale: NewsTranslationLocale;
  apiKey: string;
  model?: string;
  timeout?: number;
}

const SYSTEM_PROMPT = `You translate Arcane Reader product news from Russian into the requested language.
Keep the technical-startup changelog voice: concrete, calm, no hype.
Preserve markdown exactly: headings, lists, tables, links, and fenced code.
Do not add facts, numbers, or calls to action that are not in the source.
Return JSON with keys title, summary, and body.`;

export async function draftNewsTranslation(
  input: DraftNewsTranslationInput
): Promise<{ title: string; summary: string; body: string }> {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({
    apiKey: input.apiKey,
    timeout: input.timeout ?? 60_000,
  });
  const language = LOCALE_NAMES[input.targetLocale];

  const response = await client.chat.completions.create({
    model: input.model ?? 'gpt-4.1-mini',
    temperature: 0.2,
    max_completion_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Translate this news post into ${language}.\n\n${JSON.stringify({
          title: input.title,
          summary: input.summary,
          body: input.body,
        })}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    logger.error({ err }, 'newsDraftTranslation: response was not JSON');
    throw new Error('invalid draft');
  }

  const result = draftSchema.safeParse(parsed);
  if (!result.success) {
    logger.error(
      { issues: result.error.flatten() },
      'newsDraftTranslation: draft failed validation'
    );
    throw new Error('invalid draft');
  }
  return result.data;
}
