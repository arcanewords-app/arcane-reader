/**
 * Orchestrates chapter title translation (single + batch deferred).
 */

import type { AppConfig } from '../config.js';
import type {
  Project,
  ProjectWithChapterList,
  Chapter,
  GlossaryEntry,
} from '../storage/database.js';
import type { TranslationStages } from '../config/tokenLimits.js';
import { OpenAIProvider } from '../engine/providers/openai.js';
import { translateChapterTitlesBatch } from '../engine/title-translate.js';
import { languageDisplayName } from '../engine/language.js';
import type { Language } from '../engine/types/common.js';
import {
  CHAPTER_TITLE_BATCH_SIZE,
  isGenericChapterTitle,
  localizedDefaultChapterTitle,
  truncateChapterTitle,
} from '../shared/chapterTitle.js';
import { resolveEffectiveLanguagePair } from './engine-integration.js';
import { updateChapter } from './supabaseDatabase.js';
import { incrementTokenUsage } from '../middleware/tokenLimits.js';
import { logger } from '../logger.js';

const RESPONSES_ONLY_MODELS = new Set(['gpt-5.1-codex-mini', 'codex-mini-latest']);
const FALLBACK_MODEL = 'gpt-4.1-mini';

function modelForChatCompletions(id: string): string {
  return RESPONSES_ONLY_MODELS.has(id) ? FALLBACK_MODEL : id;
}

function getTranslationModel(project: Project | ProjectWithChapterList, config: AppConfig): string {
  const fromSettings = project.settings?.stageModels?.translation;
  return modelForChatCompletions(fromSettings || project.settings?.model || config.openai.model);
}

function createTitleTranslationProvider(
  config: AppConfig,
  project: Project | ProjectWithChapterList
): OpenAIProvider {
  const model = getTranslationModel(project, config);
  return new OpenAIProvider({
    apiKey: config.openai.apiKey!,
    model,
    timeout: config.openai.timeout ?? 600000,
    maxRetries: config.openai.maxRetries ?? 3,
  });
}

function stagesIncludeTranslation(stages: TranslationStages): boolean {
  return stages === 'all' || stages.includes('translation');
}

function glossaryTextForTitles(
  titles: string[],
  glossary: GlossaryEntry[],
  targetLanguage: Language
): string | undefined {
  if (!glossary.length || !titles.length) return undefined;
  const combined = titles.join(' ').toLowerCase();
  const matched = glossary.filter((e) => {
    const orig = e.original.trim().toLowerCase();
    return orig.length >= 2 && combined.includes(orig);
  });
  if (!matched.length) return undefined;
  const label = languageDisplayName(targetLanguage);
  return matched
    .slice(0, 40)
    .map((e) => `${e.original} → ${e.translated} (${label})`)
    .join('\n');
}

export interface TitleTranslationCandidate {
  chapterId: string;
  number: number;
  sourceTitle: string;
  useLlm: boolean;
}

export function collectTitleTranslationCandidates(
  chapters: Array<
    Pick<Chapter, 'id' | 'number' | 'title' | 'translatedTitle' | 'status' | 'translatedText'>
  >,
  options: {
    translateChapterTitles: boolean;
    translateOnlyEmpty: boolean;
    stages: TranslationStages;
    /** Chapter IDs that completed body translation in this run */
    succeededChapterIds: Set<string>;
  }
): TitleTranslationCandidate[] {
  if (!options.translateChapterTitles || !stagesIncludeTranslation(options.stages)) {
    return [];
  }

  const candidates: TitleTranslationCandidate[] = [];
  for (const ch of chapters) {
    if (!options.succeededChapterIds.has(ch.id)) continue;

    const sourceTitle = truncateChapterTitle(ch.title ?? '');
    if (!sourceTitle) continue;

    if (options.translateOnlyEmpty && ch.translatedTitle?.trim()) continue;

    const generic = isGenericChapterTitle(sourceTitle);
    candidates.push({
      chapterId: ch.id,
      number: ch.number,
      sourceTitle,
      useLlm: !generic,
    });
  }
  return candidates;
}

export async function applyChapterTitleTranslations(
  config: AppConfig,
  projectId: string,
  project: Project | ProjectWithChapterList,
  candidates: TitleTranslationCandidate[],
  options: {
    userId: string;
    token: string;
    languagePair?: { sourceLanguage?: string; targetLanguage?: string };
    glossary?: GlossaryEntry[];
    isCancelled?: () => boolean;
  }
): Promise<number> {
  if (candidates.length === 0) return 0;
  if (!config.openai.apiKey) {
    logger.warn('Title translation skipped: OpenAI API key not configured');
    return 0;
  }

  const { sourceLanguage, targetLanguage } = resolveEffectiveLanguagePair(
    project,
    options.languagePair
  );
  const glossary = options.glossary ?? project.glossary ?? [];
  let totalTokens = 0;

  for (const c of candidates) {
    if (options.isCancelled?.()) break;
    if (!c.useLlm) {
      const localized = localizedDefaultChapterTitle(c.number, targetLanguage);
      await updateChapter(projectId, c.chapterId, { translatedTitle: localized }, options.token, {
        useServiceRole: true,
      });
      continue;
    }
  }

  const llmCandidates = candidates.filter((c) => c.useLlm);
  if (llmCandidates.length === 0) return totalTokens;

  const provider = createTitleTranslationProvider(config, project);
  const temperature =
    project.settings?.temperatureByStage?.translation ?? project.settings?.temperature ?? 0.5;

  for (let i = 0; i < llmCandidates.length; i += CHAPTER_TITLE_BATCH_SIZE) {
    if (options.isCancelled?.()) break;
    const batch = llmCandidates.slice(i, i + CHAPTER_TITLE_BATCH_SIZE);
    const items = batch.map((c) => ({ chapterId: c.chapterId, title: c.sourceTitle }));
    const glossaryText = glossaryTextForTitles(
      batch.map((c) => c.sourceTitle),
      glossary,
      targetLanguage
    );

    try {
      const { results, tokensUsed } = await translateChapterTitlesBatch(provider, items, {
        sourceLanguage,
        targetLanguage,
        glossaryText,
        temperature,
        isCancelled: options.isCancelled,
      });
      totalTokens += tokensUsed.total ?? 0;

      for (const r of results) {
        await updateChapter(
          projectId,
          r.chapterId,
          { translatedTitle: r.translatedTitle },
          options.token,
          { useServiceRole: true }
        );
      }

      if (tokensUsed.total) {
        try {
          await incrementTokenUsage(options.userId, options.token, tokensUsed.total, undefined, {
            useServiceRole: true,
          });
        } catch (tokenErr) {
          logger.warn({ err: tokenErr }, 'Failed to record title translation token usage');
        }
      }
    } catch (err) {
      logger.error(
        { err, batchStart: i, batchSize: batch.length },
        'Batch chapter title translation failed'
      );
    }
  }

  return totalTokens;
}
