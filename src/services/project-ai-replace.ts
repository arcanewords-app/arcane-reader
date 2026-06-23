/**
 * AI smart replace for project search — LLM minimal paragraph edits.
 */

import { loadConfig } from '../config.js';
import {
  GlossaryManager,
  OpenAIProvider,
  languageDisplayName,
  type Language,
} from '../engine/index.js';
import {
  blockMarkersPreserved,
  buildAiReplaceJsonSchema,
  buildAiReplaceUserPrompt,
  changeRatioTooHigh,
  getAiReplaceSystemPrompt,
  paragraphChangeRatio,
  parseAiReplaceModelResult,
  type AiReplaceModelResult,
} from '../engine/prompts/ai-replace.js';
import { resolveTranslateLlmDefaults } from '../shared/openaiModelAdapter.js';
import {
  AI_REPLACE_BATCH_SIZE,
  AI_REPLACE_MAX_INPUT_CHARS,
  AI_REPLACE_MAX_PARAGRAPHS,
  type AiReplacePresetId,
  sanitizeAiReplaceDetail,
} from '../shared/aiReplacePresets.js';
import type { Project, ProjectWithChapterList } from '../storage/database.js';
import { getAgentForProject } from './engine-integration.js';
import { loadParagraphsForAiReplace, type ParagraphForAiReplace } from './supabaseDatabase.js';

export interface AiReplaceParagraphRef {
  chapterId: string;
  paragraphId: string;
}

export interface AiReplaceRequest {
  find: string;
  replaceHint?: string;
  preset: AiReplacePresetId;
  detail?: string;
  paragraphs: AiReplaceParagraphRef[];
}

export interface AiReplaceResultItem {
  chapterId: string;
  paragraphId: string;
  paragraphIndex: number;
  chapterNumber: number;
  before: string;
  after: string;
}

export interface AiReplaceResult {
  items: AiReplaceResultItem[];
  tokensUsed: number;
  model: string;
  batches: number;
}

export class AiReplaceTooManyError extends Error {
  constructor(count: number) {
    super(`Too many paragraphs (${count}, max ${AI_REPLACE_MAX_PARAGRAPHS})`);
    this.name = 'AiReplaceTooManyError';
    this.code = 'AI_REPLACE_TOO_MANY';
  }
  readonly code: string;
}

export class AiReplaceInputTooLargeError extends Error {
  constructor(totalChars: number) {
    super(`Input too large (${totalChars} chars, max ${AI_REPLACE_MAX_INPUT_CHARS})`);
    this.name = 'AiReplaceInputTooLargeError';
    this.code = 'AI_REPLACE_INPUT_TOO_LARGE';
  }
  readonly code: string;
}

export class AiReplaceNoChangesError extends Error {
  constructor() {
    super('No changes suggested');
    this.name = 'AiReplaceNoChangesError';
    this.code = 'AI_REPLACE_NO_CHANGES';
  }
  readonly code: string;
}

export class AiReplaceOutputInvalidError extends Error {
  readonly code: string;
  readonly paragraphId?: string;
  readonly reason?: string;
  readonly changeRatio?: number;
  readonly beforeLen?: number;
  readonly afterLen?: number;

  constructor(
    message = 'Invalid model output',
    options?: {
      paragraphId?: string;
      reason?: string;
      changeRatio?: number;
      beforeLen?: number;
      afterLen?: number;
    }
  ) {
    super(message);
    this.name = 'AiReplaceOutputInvalidError';
    this.code = 'AI_REPLACE_OUTPUT_INVALID';
    this.paragraphId = options?.paragraphId;
    this.reason = options?.reason;
    this.changeRatio = options?.changeRatio;
    this.beforeLen = options?.beforeLen;
    this.afterLen = options?.afterLen;
  }
}

function filterGlossaryByFind(glossaryText: string, find: string): string {
  const needle = find.trim().toLowerCase();
  if (!needle || !glossaryText.trim()) return '';
  const lines = glossaryText.split('\n');
  const matched = lines.filter((line) => line.toLowerCase().includes(needle));
  return matched.slice(0, 10).join('\n');
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function runAiReplaceBatch(
  project: Project | ProjectWithChapterList,
  batch: ParagraphForAiReplace[],
  params: Omit<AiReplaceRequest, 'paragraphs'>,
  glossaryText: string
): Promise<{ items: AiReplaceResultItem[]; tokensUsed: number; model: string }> {
  const targetLanguage = project.targetLanguage as Language;
  const appConfig = loadConfig();
  const model = appConfig.openai.model;
  const provider = new OpenAIProvider({ apiKey: appConfig.openai.apiKey, model });
  const llmDefaults = resolveTranslateLlmDefaults(model, true);

  const systemPrompt = getAiReplaceSystemPrompt(targetLanguage);
  const userPrompt = buildAiReplaceUserPrompt({
    preset: params.preset,
    targetLanguage,
    find: params.find,
    replaceHint: params.replaceHint,
    detail: sanitizeAiReplaceDetail(params.detail),
    glossaryText: filterGlossaryByFind(glossaryText, params.find),
    paragraphs: batch.map((p) => ({
      paragraphId: p.paragraphId,
      translatedText: p.translatedText,
    })),
  });

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  const schema = buildAiReplaceJsonSchema(batch.length);
  const maxTokens = Math.min(16384, llmDefaults.maxTokens);

  let tokensUsed = 0;
  let parsed: AiReplaceModelResult;

  if (typeof provider.completeStructuredJSON === 'function') {
    const response = await provider.completeStructuredJSON<AiReplaceModelResult>(
      messages,
      schema,
      'ai_replace_v1',
      { temperature: 0.2, maxTokens, reasoningEffort: llmDefaults.defaultReasoningEffort }
    );
    tokensUsed = response.tokensUsed.total;
    parsed = response.data;
  } else {
    const response = await provider.completeJSON<AiReplaceModelResult>(messages, {
      temperature: 0.2,
      maxTokens,
      reasoningEffort: llmDefaults.defaultReasoningEffort,
    });
    tokensUsed = response.tokensUsed.total;
    parsed = response.data;
  }

  const byId = new Map(batch.map((p) => [p.paragraphId, p]));
  const allowedIds = new Set(batch.map((p) => p.paragraphId));
  const rows = parseAiReplaceModelResult(parsed);

  const items: AiReplaceResultItem[] = [];
  for (const row of rows) {
    if (!allowedIds.has(row.id)) {
      throw new AiReplaceOutputInvalidError('Model returned unknown paragraph id', {
        paragraphId: row.id,
        reason: 'unknown_paragraph',
      });
    }
    const source = byId.get(row.id)!;
    const before = source.translatedText;
    const after = row.text;

    if (!after || after === before) continue;
    if (!blockMarkersPreserved(before, after)) {
      throw new AiReplaceOutputInvalidError('Block markers were altered', {
        paragraphId: row.id,
        reason: 'block_markers',
        beforeLen: before.length,
        afterLen: after.length,
      });
    }
    if (changeRatioTooHigh(before, after)) {
      const ratio = paragraphChangeRatio(before, after);
      throw new AiReplaceOutputInvalidError('Paragraph change too large', {
        paragraphId: row.id,
        reason: 'change_ratio',
        changeRatio: ratio,
        beforeLen: before.length,
        afterLen: after.length,
      });
    }

    items.push({
      chapterId: source.chapterId,
      paragraphId: source.paragraphId,
      paragraphIndex: source.paragraphIndex,
      chapterNumber: source.chapterNumber,
      before,
      after,
    });
  }

  return { items, tokensUsed, model };
}

export async function runProjectAiReplace(
  project: Project | ProjectWithChapterList,
  request: AiReplaceRequest,
  token: string
): Promise<AiReplaceResult> {
  const uniqueRefs = new Map<string, AiReplaceParagraphRef>();
  for (const ref of request.paragraphs) {
    uniqueRefs.set(ref.paragraphId, ref);
  }
  const refs = [...uniqueRefs.values()];

  if (refs.length === 0) {
    throw new AiReplaceNoChangesError();
  }
  if (refs.length > AI_REPLACE_MAX_PARAGRAPHS) {
    throw new AiReplaceTooManyError(refs.length);
  }

  const loaded = await loadParagraphsForAiReplace(project.id, refs, token);
  if (loaded.length === 0) {
    throw new AiReplaceOutputInvalidError('No paragraphs found');
  }
  if (loaded.length !== refs.length) {
    throw new AiReplaceOutputInvalidError('Some paragraphs were not found in project');
  }

  const totalChars = loaded.reduce((sum, p) => sum + p.translatedText.length, 0);
  if (totalChars > AI_REPLACE_MAX_INPUT_CHARS) {
    throw new AiReplaceInputTooLargeError(totalChars);
  }

  const agent = await getAgentForProject(project);
  const glossaryText = new GlossaryManager(agent.glossary).toPromptText({
    targetLanguageLabel: languageDisplayName(project.targetLanguage as Language),
  });

  const batches = chunkArray(loaded, AI_REPLACE_BATCH_SIZE);
  const allItems: AiReplaceResultItem[] = [];
  let tokensUsed = 0;
  let model = '';

  for (const batch of batches) {
    const result = await runAiReplaceBatch(
      project,
      batch,
      {
        find: request.find,
        replaceHint: request.replaceHint,
        preset: request.preset,
        detail: request.detail,
      },
      glossaryText
    );
    allItems.push(...result.items);
    tokensUsed += result.tokensUsed;
    model = result.model;
  }

  if (allItems.length === 0) {
    throw new AiReplaceNoChangesError();
  }

  return {
    items: allItems,
    tokensUsed,
    model,
    batches: batches.length,
  };
}
