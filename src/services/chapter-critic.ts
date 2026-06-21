/**
 * Chapter translation critic — LLM review for a single chapter.
 */

import { loadConfig } from '../config.js';
import {
  GlossaryManager,
  OpenAIProvider,
  languageDisplayName,
  type Language,
} from '../engine/index.js';
import {
  buildChapterCriticJsonSchema,
  buildChapterCriticUserPrompt,
  getChapterCriticSystemPrompt,
  numberParagraphsForCritic,
} from '../engine/prompts/critic.js';
import { resolveTranslateLlmDefaults } from '../shared/openaiModelAdapter.js';
import {
  buildCriticInputStats,
  criticInputTooLargeMessage,
  criticNeedsHighOutputBudget,
  CRITIC_CHUNKED_PARAGRAPH_THRESHOLD,
  resolveCriticIssueBudget,
  type CriticInputStats,
} from '../shared/critic-limits.js';
import {
  normalizeCriticResult,
  type ChapterCriticResult,
  type EvaluationIssue,
} from '../shared/evaluation-normalize.js';
import type { Chapter, Project, ProjectWithChapterList } from '../storage/database.js';
import { getAgentForProject } from './engine-integration.js';
import { computeCriticContentFingerprintFromTexts } from '../shared/critic-fingerprint.js';

export interface ChapterCriticReport {
  strengths: string;
  summary: string;
  issues: EvaluationIssue[];
  contentFingerprint: string;
  paragraphCount: number;
  model: string;
  tokensUsed: number;
  durationMs: number;
  createdAt: string;
}

export class CriticInputTooLargeError extends Error {
  readonly totalChars: number;
  readonly maxChars: number;

  constructor(totalChars: number, maxChars: number) {
    super(criticInputTooLargeMessage({ totalChars, maxInputChars: maxChars } as CriticInputStats));
    this.name = 'CriticInputTooLargeError';
    this.totalChars = totalChars;
    this.maxChars = maxChars;
  }
}

export class CriticChapterTooLongError extends Error {
  constructor(paragraphCount: number) {
    super(
      `Chapter has ${paragraphCount} paragraphs; chunked review is not yet supported (max ${CRITIC_CHUNKED_PARAGRAPH_THRESHOLD}).`
    );
    this.name = 'CriticChapterTooLongError';
  }
}

export class CriticNoTranslationError extends Error {
  constructor() {
    super('Chapter has no translation to review');
    this.name = 'CriticNoTranslationError';
  }
}

export class CriticOutputTruncatedError extends Error {
  constructor() {
    super('critic_output_truncated');
    this.name = 'CriticOutputTruncatedError';
  }
}

export function computeCriticContentFingerprint(paragraphs: Chapter['paragraphs']): string {
  const sorted = [...paragraphs].sort((a, b) => a.index - b.index);
  return computeCriticContentFingerprintFromTexts(sorted.map((p) => p.translatedText ?? ''));
}

function sortedParagraphs(chapter: Chapter): Chapter['paragraphs'] {
  return [...(chapter.paragraphs ?? [])].sort((a, b) => a.index - b.index);
}

export function buildCriticChapterTexts(chapter: Chapter): {
  sourceTexts: string[];
  translationTexts: string[];
  paragraphCount: number;
} {
  const paragraphs = sortedParagraphs(chapter);
  return {
    sourceTexts: paragraphs.map((p) => p.originalText),
    translationTexts: paragraphs.map((p) => p.translatedText ?? ''),
    paragraphCount: paragraphs.length,
  };
}

export function computeCriticInputStats(chapter: Chapter, glossaryText: string): CriticInputStats {
  const { sourceTexts, translationTexts, paragraphCount } = buildCriticChapterTexts(chapter);
  return buildCriticInputStats({
    sourceChars: sourceTexts.join('\n\n').length,
    translationChars: translationTexts.join('\n\n').length,
    glossaryChars: glossaryText.length,
    paragraphCount,
  });
}

function assertCriticPreflight(chapter: Chapter, stats: CriticInputStats): void {
  if (stats.tooLarge) {
    throw new CriticInputTooLargeError(stats.totalChars, stats.maxInputChars);
  }
  if (stats.paragraphCount > CRITIC_CHUNKED_PARAGRAPH_THRESHOLD) {
    throw new CriticChapterTooLongError(stats.paragraphCount);
  }
  const hasTranslation = chapter.paragraphs?.some(
    (p) => (p.translatedText?.trim() ?? '').length > 0
  );
  if (!hasTranslation) {
    throw new CriticNoTranslationError();
  }
}

export async function runChapterCritic(
  project: Project | ProjectWithChapterList,
  chapter: Chapter
): Promise<ChapterCriticReport> {
  const { targetLanguage } = project;
  const agent = await getAgentForProject(project);
  const glossaryText = new GlossaryManager(agent.glossary).toPromptText({
    targetLanguageLabel: languageDisplayName(targetLanguage as Language),
  });

  const stats = computeCriticInputStats(chapter, glossaryText);
  assertCriticPreflight(chapter, stats);

  const { sourceTexts, translationTexts, paragraphCount } = buildCriticChapterTexts(chapter);
  const maxIssues = resolveCriticIssueBudget(paragraphCount);
  const targetLang = targetLanguage as Language;

  const systemPrompt = getChapterCriticSystemPrompt({ maxIssues, targetLanguage: targetLang });
  const userPrompt = buildChapterCriticUserPrompt({
    numberedSource: numberParagraphsForCritic(sourceTexts),
    numberedTranslation: numberParagraphsForCritic(translationTexts),
    glossaryText,
  });

  const appConfig = loadConfig();
  const model = appConfig.openai.model;
  const provider = new OpenAIProvider({ apiKey: appConfig.openai.apiKey, model });
  const llmDefaults = resolveTranslateLlmDefaults(model, true);
  const highBudget = criticNeedsHighOutputBudget(paragraphCount, stats.totalChars);
  const maxTokens = highBudget ? 16384 : llmDefaults.maxTokens;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  const schema = buildChapterCriticJsonSchema(maxIssues);
  const started = Date.now();

  let tokensUsed = 0;
  let result: ChapterCriticResult;

  try {
    if (typeof provider.completeStructuredJSON === 'function') {
      const response = await provider.completeStructuredJSON<ChapterCriticResult>(
        messages,
        schema,
        'chapter_critic_v1',
        { temperature: 0.3, maxTokens, reasoningEffort: llmDefaults.defaultReasoningEffort }
      );
      tokensUsed = response.tokensUsed.total;
      result = normalizeCriticResult(response.data);
    } else {
      const response = await provider.completeJSON<ChapterCriticResult>(messages, {
        temperature: 0.3,
        maxTokens,
        reasoningEffort: llmDefaults.defaultReasoningEffort,
      });
      tokensUsed = response.tokensUsed.total;
      result = normalizeCriticResult(response.data);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('truncated at max_tokens') || msg === 'critic_output_truncated') {
      throw new CriticOutputTruncatedError();
    }
    throw err;
  }

  const fingerprint = computeCriticContentFingerprint(chapter.paragraphs ?? []);

  return {
    strengths: result.strengths,
    summary: result.summary,
    issues: result.issues,
    contentFingerprint: fingerprint,
    paragraphCount,
    model,
    tokensUsed,
    durationMs: Date.now() - started,
    createdAt: new Date().toISOString(),
  };
}
