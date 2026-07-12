/**
 * Chapter translation pipeline (exported for BullMQ worker).
 */

import { loadConfig } from '../config.js';
import type { TranslationStages } from '../config/tokenLimits.js';
import type { UserRole } from '../types/roles.js';
import { incrementTokenUsage } from '../middleware/tokenLimits.js';
import {
  addGlossaryEntry,
  updateGlossaryEntry,
  getGlossaryEntry,
  updateChapter,
  getChapter,
} from '../services/supabaseDatabase.js';
import {
  mergeParagraphsToText,
  type Chapter,
  type Project,
  type ProjectWithChapterList,
  type Paragraph,
} from '../storage/database.js';
import {
  translateChapterWithPipeline,
  getStageModel,
  type LanguagePairOverride,
} from '../services/engine-integration.js';
import {
  applyChapterTitleTranslations,
  collectTitleTranslationCandidates,
} from '../services/chapterTitleTranslate.js';
import { invalidateProjectAndRelatedCaches } from '../services/cacheInvalidation.js';
import { isChunkError } from '../shared/chunkErrors.js';
import {
  getTranslationCoverage,
  resolveChapterStatusAfterTranslation,
} from '../shared/chapterTranslationCoverage.js';
import {
  syncEditedMarkersToParagraphs,
  syncTranslationJSONToParagraphs,
  logSuspectTruncationsAfterSync,
} from '../shared/paragraphSync.js';
import {
  buildMarkedTextFromParagraphs,
  parseEditedTextByMarkers,
} from './chapters/helpers/paragraphMarkers.js';
import {
  formatStageModelInfo,
  isAnalysisOnlyRun,
  needsExistingTranslatedTextForEditing,
  phase1StagesIncludeAnalysis,
  resolvePhase1IncludeGlossaryInTranslation,
  resolvePhase1Stages,
  shouldRunTwoPhaseEditing,
  shouldTranslateChapterTitles,
} from './chapters/helpers/translationStageDispatch.js';
import {
  isValidPhase2TranslationText,
  validateTranslationPipelineResult,
} from './chapters/helpers/translationResultValidation.js';
import {
  resolveExistingTranslatedTextForPipeline,
  resolveTranslationSubsetPlan,
} from './chapters/helpers/translationSubset.js';
import { splitTranslatedTextToChunks } from './chapters/helpers/translatedTextChunks.js';
import { createTraceId, runWithDebugContextAsync } from '../debug/context.js';
import { logger } from '../logger.js';
import {
  translationCancelRegistry,
  translationCancelKey,
  setTranslationProgress,
  clearTranslationProgress,
} from './routeHelpers.js';

const config = loadConfig();

export async function mergeGlossaryAppearanceForChapter(
  projectId: string,
  entryIds: string[],
  chapterNum: number,
  token: string,
  context: { chapterId?: string }
): Promise<void> {
  for (const entryId of entryIds) {
    const entry = await getGlossaryEntry(projectId, entryId, token, {
      useServiceRole: true,
    });
    if (!entry) {
      logger.warn(
        { projectId, entryId, chapterNum, chapterId: context.chapterId },
        'Glossary entry not found for chapter appearance merge'
      );
      continue;
    }
    const merged = [...new Set([...(entry.mentionedInChapters ?? []), chapterNum])].sort(
      (a, b) => a - b
    );
    await updateGlossaryEntry(projectId, entryId, { mentionedInChapters: merged }, token, {
      useServiceRole: true,
    });
  }
}

/**
 * Translation logic - uses arcane-engine.
 * Glossary accumulates per project: new entries from the analysis stage are saved
 * to the project and available for subsequent chapters. Stages (analysis |
 * translation | editing | all) are passed from the API request body.
 * Exported for use by BullMQ worker (runTranslateJob).
 */
export async function performTranslation(
  projectId: string,
  chapterId: string,
  chapter: Chapter,
  project: Project | ProjectWithChapterList,
  startTime: number,
  translateOnlyEmpty: boolean = false,
  token: string,
  userId: string,
  paragraphIds?: string[],
  stages: TranslationStages = 'all',
  options?: {
    externalIsCancelled?: () => boolean;
    /** Called on chunk progress (e.g. for batch job updates) */
    onProgress?: (chunksDone: number, totalChunks: number, stage?: string) => void;
    traceId?: string;
    jobId?: string;
    requestId?: string;
    /** Ephemeral language pair override for this run. */
    languagePair?: LanguagePairOverride;
    /** When false, skip chapter title translation (default: true). */
    translateChapterTitles?: boolean;
    /** When true, skip per-chapter title translation (bulk job runs batch phase 2). */
    deferChapterTitleTranslation?: boolean;
    userRole?: UserRole;
  }
): Promise<void> {
  const traceId = options?.traceId ?? createTraceId();
  return runWithDebugContextAsync(
    {
      traceId,
      requestId: options?.requestId,
      projectId,
      chapterId,
      jobId: options?.jobId,
    },
    async () =>
      performTranslationInner(
        projectId,
        chapterId,
        chapter,
        project,
        startTime,
        translateOnlyEmpty,
        token,
        userId,
        paragraphIds,
        stages,
        options,
        traceId
      )
  );
}

async function performTranslationInner(
  projectId: string,
  chapterId: string,
  chapter: Chapter,
  project: Project | ProjectWithChapterList,
  startTime: number,
  translateOnlyEmpty: boolean,
  token: string,
  userId: string,
  paragraphIds: string[] | undefined,
  stages: TranslationStages,
  options:
    | {
        externalIsCancelled?: () => boolean;
        onProgress?: (chunksDone: number, totalChunks: number, stage?: string) => void;
        jobId?: string;
        languagePair?: LanguagePairOverride;
        translateChapterTitles?: boolean;
        deferChapterTitleTranslation?: boolean;
        userRole?: UserRole;
      }
    | undefined,
  traceId: string
): Promise<void> {
  const cancelKey = translationCancelKey(projectId, chapterId);
  const isCancelled = () =>
    translationCancelRegistry.get(cancelKey) === true || options?.externalIsCancelled?.() === true;
  let savedDraftThisRun = false;
  let chunkProgressStarted = false;
  const handleChunkProgress = (chunksDone: number, totalChunks: number, stage?: string) => {
    setTranslationProgress(projectId, chapterId, { chunksDone, totalChunks, stage });
    options?.onProgress?.(chunksDone, totalChunks, stage);
    if (totalChunks <= 0) return;
    if (!chunkProgressStarted) {
      chunkProgressStarted = true;
      logger.info(
        {
          event: 'translation.chunk_progress',
          phase: 'started',
          traceId,
          jobId: options?.jobId,
          projectId,
          chapterId,
          totalChunks,
          stage,
        },
        'Translation chunk progress started'
      );
    }
    if (chunksDone === totalChunks) {
      logger.info(
        {
          event: 'translation.chunk_progress',
          phase: 'completed',
          traceId,
          jobId: options?.jobId,
          projectId,
          chapterId,
          chunksDone,
          totalChunks,
          stage,
        },
        'Translation chunk progress completed'
      );
    }
  };

  logger.info(
    {
      event: 'translation.perform_start',
      traceId,
      jobId: options?.jobId,
      projectId,
      chapterId,
      chapterTitle: chapter.title,
      chapterNumber: chapter.number,
      stages,
    },
    `Translation started: "${chapter.title}" (ch. ${chapter.number}), stages: ${Array.isArray(stages) ? stages.join(',') : stages}`
  );

  try {
    if (!chapter) {
      throw new Error('Глава не указана');
    }

    // Use chapter.originalText if set; otherwise derive from paragraphs (e.g. after "mark as translated")
    const effectiveOriginalText =
      chapter.originalText && chapter.originalText.trim().length > 0
        ? chapter.originalText.trim()
        : chapter.paragraphs && chapter.paragraphs.length > 0
          ? mergeParagraphsToText(chapter.paragraphs, 'originalText').trim()
          : '';
    if (!effectiveOriginalText) {
      throw new Error('Глава не содержит исходного текста');
    }
    const chapterWithOriginal = { ...chapter, originalText: effectiveOriginalText };

    const paragraphs = chapterWithOriginal.paragraphs || [];
    if (paragraphs.length === 0) {
      throw new Error('Глава не содержит параграфов');
    }

    if (!config.openai.apiKey) {
      logger.warn(
        { projectId, chapterId, chapterTitle: chapter.title },
        'Demo mode: API key not configured'
      );

      // Demo mode - translate paragraphs individually
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Update paragraphs with demo translations
      const demoParagraphs = chapterWithOriginal.paragraphs || [];
      const updatedParagraphs = demoParagraphs.map((p, idx) => ({
        ...p,
        translatedText: `[ДЕМО ${idx + 1}] ${p.originalText.substring(0, 50)}...`,
        status: 'translated' as const,
        editedAt: new Date().toISOString(),
        editedBy: 'ai' as const,
      }));

      const demoText = updatedParagraphs.map((p) => p.translatedText).join('\n\n');

      await updateChapter(
        projectId,
        chapterId,
        {
          paragraphs: updatedParagraphs,
          translatedText: demoText,
          status: 'completed',
          translationMeta: {
            tokensUsed: 0,
            duration: Date.now() - startTime,
            model: 'demo',
            translatedAt: new Date().toISOString(),
          },
        },
        token
      );

      logger.info(
        {
          event: 'translation.demo_completed',
          projectId,
          chapterId,
          durationMs: Date.now() - startTime,
          paragraphsCount: demoParagraphs.length,
        },
        `Demo translation completed in ${Date.now() - startTime}ms (${demoParagraphs.length} paragraphs)`
      );
      return;
    }

    const analysisModel = getStageModel(
      project,
      'analysis',
      config.openai.model,
      options?.userRole
    );
    const translationModel = getStageModel(
      project,
      'translation',
      config.openai.model,
      options?.userRole
    );
    const editingModel = getStageModel(project, 'editing', config.openai.model, options?.userRole);

    const projectTemperature = project.settings?.temperature ?? config.translation.temperature;

    logger.info(
      {
        event: 'pipeline.start',
        traceId,
        jobId: options?.jobId,
        projectId,
        chapterId,
        analysisModel,
        translationModel,
        editingModel,
        temperature: projectTemperature,
      },
      'Starting arcane-engine TranslationPipeline'
    );

    const subsetPlan = resolveTranslationSubsetPlan(chapterWithOriginal, {
      paragraphIds,
      translateOnlyEmpty,
    });
    const chapterToTranslate = {
      ...chapterWithOriginal,
      originalText: subsetPlan.chapterOriginalText,
    };
    const paragraphsToTranslate = subsetPlan.paragraphsToTranslate;
    const translateSubsetOnly = subsetPlan.translateSubsetOnly;

    if (subsetPlan.skipReason === 'no_selected_paragraphs') {
      logger.info({ projectId, chapterId }, 'No selected paragraphs to translate');
      await updateChapter(projectId, chapterId, { status: 'completed' }, token, {
        useServiceRole: true,
      });
      return;
    }
    if (subsetPlan.skipReason === 'no_empty_paragraphs') {
      logger.info({ projectId, chapterId }, 'No empty paragraphs to translate; skipping');
      await updateChapter(projectId, chapterId, { status: 'completed' }, token, {
        useServiceRole: true,
      });
      return;
    }
    if (translateSubsetOnly) {
      logger.info(
        {
          projectId,
          chapterId,
          selectedCount: paragraphsToTranslate.length,
          totalParagraphs: (chapterWithOriginal.paragraphs || []).length,
        },
        `Selected paragraphs mode: ${paragraphsToTranslate.length} of ${(chapterWithOriginal.paragraphs || []).length}`
      );
    } else if (translateOnlyEmpty) {
      const paragraphs = chapterWithOriginal.paragraphs || [];
      const textLength = mergeParagraphsToText(paragraphsToTranslate, 'originalText').length;
      const wordCount = mergeParagraphsToText(paragraphsToTranslate, 'originalText').split(
        /\s+/
      ).length;
      logger.info(
        {
          projectId,
          chapterId,
          emptyCount: paragraphsToTranslate.length,
          totalParagraphs: paragraphs.length,
          textLength,
          wordCount,
          skipCount: paragraphs.length - paragraphsToTranslate.length,
        },
        `Partial translation: ${paragraphsToTranslate.length} of ${paragraphs.length} paragraphs (~${wordCount} words)`
      );
    }

    // Create project-specific config
    const projectConfig = {
      ...config,
      openai: {
        ...config.openai,
        model: translationModel,
      },
      translation: {
        ...config.translation,
        temperature: projectTemperature,
      },
    };

    if (isCancelled()) {
      logger.info(
        { projectId, chapterId, chapterTitle: chapter.title },
        'Translation cancelled by user before pipeline start'
      );
      await updateChapter(projectId, chapterId, { status: 'pending' }, token, {
        useServiceRole: true,
      });
      return;
    }

    // Two-phase when both translation and editing: save draft after stage 2, then run stage 3 (refactor 2.1)
    const runEditing = shouldRunTwoPhaseEditing(stages);
    const phase1Stages = resolvePhase1Stages(stages, runEditing);

    let result;
    try {
      const needsExistingText = needsExistingTranslatedTextForEditing(stages);
      // When runEditing (two-phase): phase 1 gets stages ['analysis','translation']; pipeline cannot
      // infer willRunEditing from runStages. Pass includeGlossaryInTranslation explicitly: when
      // editing will run, default false (omit glossary, 3500 chunks); else default true.
      const phase1IncludeGlossaryInTranslation = resolvePhase1IncludeGlossaryInTranslation(
        project.settings?.includeGlossaryInTranslation,
        runEditing
      );
      result = await translateChapterWithPipeline(projectConfig, project, chapterToTranslate, {
        stages: phase1Stages,
        existingTranslatedText: needsExistingText
          ? resolveExistingTranslatedTextForPipeline(chapterWithOriginal)
          : undefined,
        isCancelled,
        includeGlossaryInAnalysis: project.settings?.includeGlossaryInAnalysis ?? true,
        includeGlossaryInTranslation: phase1IncludeGlossaryInTranslation,
        includeGlossaryInEditing: project.settings?.includeGlossaryInEditing ?? true,
        languagePair: options?.languagePair,
        userRole: options?.userRole,
        onProgress: handleChunkProgress,
      });
    } catch (pipelineError) {
      const errorMessage =
        pipelineError instanceof Error ? pipelineError.message : 'Unknown pipeline error';
      logger.error(
        { err: pipelineError, projectId, chapterId },
        `Pipeline error in translateChapterWithPipeline: ${errorMessage}`
      );
      throw pipelineError;
    }

    // Cancelled after stage 1: save glossary and set status to pending (refactor 2.2)
    if (result.cancelled) {
      logger.info(
        { projectId, chapterId },
        'Translation cancelled after analysis; saving glossary and setting status to pending'
      );
      if (result.glossaryUpdates?.length) {
        for (const entry of result.glossaryUpdates) {
          await addGlossaryEntry(projectId, entry, token, { useServiceRole: true });
        }
      }
      if (result.glossaryUpdatesExisting?.length) {
        for (const { id: entryId, updates } of result.glossaryUpdatesExisting) {
          await updateGlossaryEntry(projectId, entryId, updates, token, {
            useServiceRole: true,
          });
        }
      }
      if (result.glossaryAppearanceEntryIds?.length) {
        await mergeGlossaryAppearanceForChapter(
          projectId,
          result.glossaryAppearanceEntryIds,
          chapter.number,
          token,
          { chapterId }
        );
      }
      await updateChapter(projectId, chapterId, { status: 'pending' }, token, {
        useServiceRole: true,
      });
      try {
        await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage, {
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn(
          { err: tokenError, projectId, chapterId },
          'Failed to update token usage (non-critical)'
        );
      }
      return;
    }

    logger.info(
      {
        event: 'translation.completed',
        traceId,
        jobId: options?.jobId,
        projectId,
        chapterId,
        durationMs: result.duration,
        durationSec: (result.duration / 1000).toFixed(1),
        tokensUsed: result.tokensUsed,
        tokensByStage: result.tokensByStage,
      },
      `Translation completed in ${(result.duration / 1000).toFixed(1)}s (${result.tokensUsed.toLocaleString()} tokens)`
    );

    if (result.glossaryUpdates?.length) {
      logger.info(
        { projectId, chapterId, glossaryUpdatesCount: result.glossaryUpdates.length },
        `Glossary: ${result.glossaryUpdates.length} new entries`
      );
    }

    // stages = ['analysis'] only: save glossary, don't update chapter translation
    if (isAnalysisOnlyRun(stages)) {
      if (result.glossaryUpdates?.length) {
        for (const entry of result.glossaryUpdates) {
          await addGlossaryEntry(projectId, entry, token, { useServiceRole: true });
        }
      }
      if (result.glossaryUpdatesExisting?.length) {
        for (const { id: entryId, updates } of result.glossaryUpdatesExisting) {
          await updateGlossaryEntry(projectId, entryId, updates, token, {
            useServiceRole: true,
          });
        }
      }
      if (result.glossaryAppearanceEntryIds?.length) {
        await mergeGlossaryAppearanceForChapter(
          projectId,
          result.glossaryAppearanceEntryIds,
          chapter.number,
          token,
          { chapterId }
        );
      }
      const nowIso = new Date().toISOString();
      // When only analysis ran: always set status to 'analyzed' so UI shows 🔍 (analysis-only),
      // not ✅ (completed). If the chapter already had translation, we keep the content but the
      // badge reflects "last run was analysis only".
      await updateChapter(
        projectId,
        chapterId,
        {
          status: 'analyzed',
          translationMeta: {
            ...(chapter.translationMeta || {}),
            tokensUsed: result.tokensUsed,
            tokensByStage: result.tokensByStage,
            duration: result.duration,
            model: analysisModel,
            translatedAt: nowIso,
            lastAnalysisAt: nowIso,
          },
        },
        token,
        { useServiceRole: true }
      );
      try {
        await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage, {
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn(
          { err: tokenError, projectId, chapterId },
          'Failed to update token usage (non-critical)'
        );
      }
      return;
    }

    // Validate translation result
    const validation = validateTranslationPipelineResult(result);
    if (!validation.valid) {
      const errorMessage = validation.errorMessage ?? 'Translation validation failed';

      logger.warn(
        {
          projectId,
          chapterId,
          tokensUsed: result.tokensUsed,
          durationMs: result.duration,
          translatedPreview: result.translatedText ? result.translatedText.substring(0, 100) : null,
        },
        `Validation failed: ${errorMessage}`
      );

      const modelInfoOnError = formatStageModelInfo(stages, {
        analysis: analysisModel,
        translation: translationModel,
        editing: editingModel,
      });

      await updateChapter(
        projectId,
        chapterId,
        {
          status: 'error',
          translatedText: result.translatedText || `❌ Ошибка перевода: ${errorMessage}`,
          translationMeta: {
            ...(chapter.translationMeta || {}),
            tokensUsed: result.tokensUsed,
            tokensByStage: result.tokensByStage,
            duration: result.duration,
            model: modelInfoOnError,
            translatedAt: new Date().toISOString(),
            ...(result.chunksCount !== undefined && { chunksCount: result.chunksCount }),
            ...(result.failedChunkIndex !== undefined && {
              failedChunkIndex: result.failedChunkIndex,
            }),
          },
        },
        token,
        { useServiceRole: true }
      );

      // Count tokens toward usage even when translation failed (stages were run)
      if (result.tokensUsed > 0) {
        try {
          await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage, {
            useServiceRole: true,
          });
        } catch (tokenError) {
          logger.warn(
            { err: tokenError, projectId, chapterId },
            'Failed to update token usage (non-critical)'
          );
        }
      }

      return;
    }

    // Try to parse JSON structure from translation
    // The model should return JSON with paragraph markers
    let parsedJSON: { paragraphs: Array<{ id: string; translated: string }> } | null = null;
    let translatedChunks: string[] = [];

    try {
      // Try to parse as JSON first
      const jsonMatch = result.translatedText.match(/\{[\s\S]*"paragraphs"[\s\S]*\}/);
      if (jsonMatch) {
        const jsonText = jsonMatch[0];
        const parsed = JSON.parse(jsonText);
        if (parsed && parsed.paragraphs && Array.isArray(parsed.paragraphs)) {
          parsedJSON = parsed;
          if (parsedJSON) {
            logger.debug(
              { projectId, chapterId, paragraphsCount: parsedJSON.paragraphs.length },
              `Translation in JSON format with ${parsedJSON.paragraphs.length} paragraphs`
            );
          }
        }
      }
    } catch (jsonError) {
      logger.debug(
        {
          projectId,
          chapterId,
          jsonError: jsonError instanceof Error ? jsonError.message : 'Unknown error',
        },
        'JSON parse failed, using text format'
      );
    }

    // Prepare text-based chunks as fallback
    if (!parsedJSON) {
      translatedChunks = splitTranslatedTextToChunks(result.translatedText);

      logger.debug(
        { projectId, chapterId, chunksCount: translatedChunks.length },
        `Translation split into ${translatedChunks.length} chunks for sync (text format)`
      );
    }

    // Get current chapter state for synchronization (service role so JWT expiry during long run doesn't fail)
    const currentChapter = await getChapter(projectId, chapterId, token, { useServiceRole: true });
    if (!currentChapter) {
      throw new Error('Не удалось получить главу для синхронизации');
    }

    const originalParagraphsForSync = translateSubsetOnly
      ? paragraphsToTranslate
      : currentChapter.paragraphs;
    const partialSync = subsetPlan.partialSync;

    let syncedParagraphs: Paragraph[];

    if (parsedJSON && parsedJSON.paragraphs && Array.isArray(parsedJSON.paragraphs)) {
      logger.debug({ projectId, chapterId }, 'Auto-sync: translation to paragraphs (JSON format)');
      syncedParagraphs = syncTranslationJSONToParagraphs(
        originalParagraphsForSync,
        parsedJSON,
        partialSync
      );
    } else {
      const parsedByMarkers = parseEditedTextByMarkers(result.translatedText);
      if (parsedByMarkers.length > 0) {
        logger.debug(
          { projectId, chapterId, parsedCount: parsedByMarkers.length },
          'Auto-sync: translation to paragraphs (marker format)'
        );
        syncedParagraphs = syncEditedMarkersToParagraphs(
          originalParagraphsForSync,
          parsedByMarkers
        );
        if (!parsedJSON) {
          translatedChunks = syncedParagraphs
            .map((p) => (p.translatedText ?? '').trim())
            .filter(Boolean);
        }
      } else {
        logger.debug(
          { projectId, chapterId },
          'Auto-sync: translation to paragraphs (text format)'
        );
        syncedParagraphs = syncTranslationChunksToParagraphs(
          originalParagraphsForSync,
          translatedChunks,
          partialSync
        );
      }
    }

    // When we translated only a subset (paragraphIds), merge synced subset back into full paragraphs
    if (translateSubsetOnly && currentChapter.paragraphs) {
      const syncedById = new Map(syncedParagraphs.map((p) => [p.id, p]));
      syncedParagraphs = currentChapter.paragraphs.map((p) => syncedById.get(p.id) ?? p);
    }

    // Create model info string based on stages run (analysis-only already returned above)
    const modelInfo = formatStageModelInfo(stages, {
      analysis: analysisModel,
      translation: translationModel,
      editing: editingModel,
    });

    // Prepare translatedChunks for saving (use from parsedJSON or text-based chunks)
    const chunksToSave =
      parsedJSON && parsedJSON.paragraphs
        ? parsedJSON.paragraphs.map((p) => p.translated)
        : translatedChunks;

    const nowIso = new Date().toISOString();
    const ranAnalysis = phase1StagesIncludeAnalysis(phase1Stages);

    if (runEditing) {
      const phase1Status = resolveChapterStatusAfterTranslation({
        paragraphs: syncedParagraphs,
        runEditing: true,
        editingPhase: 'after_translate',
      });
      logTranslationCoverageIfIncomplete(projectId, chapterId, syncedParagraphs);
      // Refactor 2.1: save draft after stage 2, then run stage 3 (editing)
      await updateChapter(
        projectId,
        chapterId,
        {
          translatedText: result.translatedText,
          translatedChunks: chunksToSave,
          paragraphs: syncedParagraphs,
          status: phase1Status,
          translationMeta: {
            ...(chapter.translationMeta || {}),
            tokensUsed: result.tokensUsed,
            tokensByStage: result.tokensByStage,
            duration: result.duration,
            model: `${analysisModel}/${translationModel}`,
            translatedAt: nowIso,
            lastAnalysisAt: ranAnalysis
              ? nowIso
              : (chapter.translationMeta?.lastAnalysisAt ?? undefined),
            ...(result.chunksCount !== undefined && { chunksCount: result.chunksCount }),
            ...(result.failedChunkIndex !== undefined && {
              failedChunkIndex: result.failedChunkIndex,
            }),
          },
        },
        token,
        { useServiceRole: true }
      );
      savedDraftThisRun = true;
      try {
        await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage, {
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn(
          { err: tokenError, projectId, chapterId },
          'Failed to update token usage after draft (non-critical)'
        );
      }
      logger.info(
        { projectId, chapterId, chapterTitle: chapter.title },
        'Draft saved; running editing stage'
      );

      // Phase 2: editing only
      let result2;
      try {
        result2 = await translateChapterWithPipeline(projectConfig, project, chapterToTranslate, {
          stages: ['editing'],
          existingTranslatedText: buildMarkedTextFromParagraphs(syncedParagraphs),
          isCancelled,
          languagePair: options?.languagePair,
          userRole: options?.userRole,
          onProgress: handleChunkProgress,
        });
      } catch (phase2Error) {
        logger.error(
          { err: phase2Error, projectId, chapterId },
          'Editing stage failed; draft preserved'
        );
        throw phase2Error;
      }

      if (!isValidPhase2TranslationText(result2.translatedText)) {
        logger.warn(
          { projectId, chapterId, preview: result2.translatedText?.slice(0, 80) },
          'Editing returned invalid text; keeping draft'
        );
        return;
      }

      // Sync edited text to paragraphs (prefer marker-based 1:1, fallback to chunk sync)
      const currentChapter2 = await getChapter(projectId, chapterId, token, {
        useServiceRole: true,
      });
      const paragraphsForSync2 = translateSubsetOnly
        ? paragraphsToTranslate
        : (currentChapter2?.paragraphs ?? syncedParagraphs);
      const parsedByMarkers = parseEditedTextByMarkers(result2.translatedText);
      let syncedParagraphs2: Paragraph[];
      let editedChunks: string[];
      if (parsedByMarkers.length > 0) {
        syncedParagraphs2 = syncEditedMarkersToParagraphs(paragraphsForSync2, parsedByMarkers);
        editedChunks = syncedParagraphs2
          .map((p) => (p.translatedText ?? '').trim())
          .filter(Boolean);
        logger.debug(
          { parsedCount: parsedByMarkers.length, paragraphCount: paragraphsForSync2.length },
          'Editing sync: used paragraph markers'
        );
      } else {
        editedChunks = result2.translatedText
          .split(/\n\s*\n/)
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        syncedParagraphs2 = syncTranslationChunksToParagraphs(
          paragraphsForSync2,
          editedChunks,
          false
        );
        logger.debug(
          { chunksCount: editedChunks.length },
          'Editing sync: fallback to chunk sync (no markers in response)'
        );
      }
      const finalParagraphs =
        translateSubsetOnly && currentChapter2?.paragraphs
          ? currentChapter2.paragraphs.map((p) => syncedParagraphs2.find((s) => s.id === p.id) ?? p)
          : syncedParagraphs2;
      const translatedTextToStore = mergeParagraphsToText(finalParagraphs, 'translatedText');

      const finalStatus = resolveChapterStatusAfterTranslation({
        paragraphs: finalParagraphs,
        runEditing: true,
        editingPhase: 'after_edit',
      });
      logTranslationCoverageIfIncomplete(projectId, chapterId, finalParagraphs);

      const nowIso2 = new Date().toISOString();
      await updateChapter(
        projectId,
        chapterId,
        {
          translatedText: translatedTextToStore,
          translatedChunks: editedChunks,
          paragraphs: finalParagraphs,
          status: finalStatus,
          translationMeta: {
            ...(chapter.translationMeta || {}),
            tokensUsed: result.tokensUsed + result2.tokensUsed,
            tokensByStage: {
              analysis: result.tokensByStage?.analysis,
              translation: result.tokensByStage?.translation ?? 0,
              editing: result2.tokensByStage?.editing ?? result2.tokensUsed ?? 0,
            },
            duration: result.duration + result2.duration,
            model: `${analysisModel}/${translationModel}/${editingModel}`,
            translatedAt: nowIso2,
            lastAnalysisAt: ranAnalysis ? nowIso2 : chapter.translationMeta?.lastAnalysisAt,
            ...(result.chunksCount !== undefined && { chunksCount: result.chunksCount }),
            ...(result.failedChunkIndex !== undefined && {
              failedChunkIndex: result.failedChunkIndex,
            }),
          },
        },
        token,
        { useServiceRole: true }
      );
      try {
        await incrementTokenUsage(userId, token, result2.tokensUsed, result2.tokensByStage, {
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn(
          { err: tokenError, projectId, chapterId },
          'Failed to update token usage after editing (non-critical)'
        );
      }
      logger.info(
        {
          event: 'translation.synced',
          projectId,
          chapterId,
          chapterTitle: chapter.title,
          chunksCount: editedChunks.length,
        },
        `Chapter translated and edited: ${chapter.title}`
      );
      // Fall through to glossary save (phase 1 result has glossary; result2 has none)
    } else {
      // Single phase: save as completed (translation-only or editing-only)
      let translatedTextToSave = result.translatedText;
      let chunksToSaveFinal = chunksToSave;
      let paragraphsToSave = syncedParagraphs;
      const editingOnly =
        Array.isArray(stages) && stages.includes('editing') && !stages.includes('translation');
      if (editingOnly && currentChapter?.paragraphs?.length) {
        const parsedByMarkers = parseEditedTextByMarkers(result.translatedText);
        if (parsedByMarkers.length > 0) {
          paragraphsToSave = syncEditedMarkersToParagraphs(
            currentChapter.paragraphs,
            parsedByMarkers
          );
          translatedTextToSave = mergeParagraphsToText(paragraphsToSave, 'translatedText');
          chunksToSaveFinal = paragraphsToSave
            .map((p) => (p.translatedText ?? '').trim())
            .filter(Boolean);
          logger.debug(
            { parsedCount: parsedByMarkers.length },
            'Editing-only sync: used paragraph markers'
          );
        }
      }
      const singlePhaseStatus = resolveChapterStatusAfterTranslation({
        paragraphs: paragraphsToSave,
        runEditing: false,
        editingPhase: editingOnly ? 'after_edit' : 'none',
      });
      logTranslationCoverageIfIncomplete(projectId, chapterId, paragraphsToSave);
      await updateChapter(
        projectId,
        chapterId,
        {
          translatedText: translatedTextToSave,
          translatedChunks: chunksToSaveFinal,
          paragraphs: paragraphsToSave,
          status: singlePhaseStatus,
          translationMeta: {
            ...(chapter.translationMeta || {}),
            tokensUsed: result.tokensUsed,
            tokensByStage: result.tokensByStage,
            duration: result.duration,
            model: modelInfo,
            translatedAt: nowIso,
            lastAnalysisAt: ranAnalysis
              ? nowIso
              : (chapter.translationMeta?.lastAnalysisAt ?? undefined),
            ...(result.chunksCount !== undefined && { chunksCount: result.chunksCount }),
            ...(result.failedChunkIndex !== undefined && {
              failedChunkIndex: result.failedChunkIndex,
            }),
          },
        },
        token,
        { useServiceRole: true }
      );
      try {
        await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage, {
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn(
          { err: tokenError, projectId, chapterId },
          'Failed to update token usage (non-critical)'
        );
      }
      logger.info(
        {
          event: 'translation.synced',
          projectId,
          chapterId,
          chapterTitle: chapter.title,
          chunksCount: chunksToSaveFinal.length,
        },
        `Chapter translated and synced: ${chapter.title} (${chunksToSaveFinal.length} chunks)`
      );
    }

    // Verify the chapter was saved correctly (service role for same reason)
    const savedChapter = await getChapter(projectId, chapterId, token, { useServiceRole: true });
    if (savedChapter) {
      const savedHasText =
        !!savedChapter.translatedText && savedChapter.translatedText.trim().length > 0;
      const savedHasChunks =
        !!savedChapter.translatedChunks && savedChapter.translatedChunks.length > 0;
      const savedHasParagraphs = savedChapter.paragraphs?.some(
        (p) => p.translatedText && p.translatedText.trim().length > 0
      );
      const syncedCount =
        savedChapter.paragraphs?.filter(
          (p) => p.translatedText && p.translatedText.trim().length > 0
        ).length || 0;

      logger.debug(
        {
          projectId,
          chapterId,
          savedHasText,
          savedHasChunks,
          savedHasParagraphs,
          syncedCount,
          status: savedChapter.status,
        },
        'Post-save verification'
      );

      if (!savedHasText && !savedHasChunks) {
        logger.warn(
          { projectId, chapterId },
          'Chapter saved but translation and chunks are missing'
        );
      }

      if (savedHasChunks && !savedHasParagraphs) {
        logger.warn(
          { projectId, chapterId },
          'Translation saved in chunks but not synced to paragraphs'
        );
      }
    } else {
      logger.error({ projectId, chapterId }, 'Failed to load saved chapter for verification');
    }

    // Auto-add detected glossary entries (new + updates for existing)
    if (result.glossaryUpdates?.length) {
      for (const entry of result.glossaryUpdates) {
        await addGlossaryEntry(projectId, entry, token, { useServiceRole: true });
      }
    }
    if (result.glossaryUpdatesExisting?.length) {
      for (const { id: entryId, updates } of result.glossaryUpdatesExisting) {
        await updateGlossaryEntry(projectId, entryId, updates, token, {
          useServiceRole: true,
        });
      }
    }
    if (result.glossaryAppearanceEntryIds?.length) {
      await mergeGlossaryAppearanceForChapter(
        projectId,
        result.glossaryAppearanceEntryIds,
        chapter.number,
        token,
        { chapterId }
      );
    }

    if (
      shouldTranslateChapterTitles(stages, {
        translateChapterTitles: options?.translateChapterTitles,
        deferChapterTitleTranslation: options?.deferChapterTitleTranslation,
      })
    ) {
      const chapterAfter = await getChapter(projectId, chapterId, token, { useServiceRole: true });
      const bodyOk =
        chapterAfter &&
        (chapterAfter.status === 'completed' ||
          chapterAfter.status === 'draft' ||
          chapterAfter.status === 'partial') &&
        (!!chapterAfter.translatedText?.trim() ||
          chapterAfter.paragraphs?.some((p) => p.translatedText?.trim()));
      if (bodyOk && chapterAfter) {
        const candidates = collectTitleTranslationCandidates([chapterAfter], {
          translateChapterTitles: true,
          translateOnlyEmpty,
          stages,
          succeededChapterIds: new Set([chapterId]),
        });
        if (candidates.length > 0) {
          await applyChapterTitleTranslations(config, projectId, project, candidates, {
            userId,
            token,
            languagePair: options?.languagePair,
            isCancelled,
            userRole: options?.userRole,
          });
          logger.info(
            { event: 'chapter.title.translated', projectId, chapterId },
            'Chapter title translated'
          );
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    if (errorMessage === 'Cancelled') {
      logger.info(
        { projectId, chapterId, chapterTitle: chapter.title },
        'Translation cancelled by user'
      );
      await updateChapter(projectId, chapterId, { status: 'pending' }, token, {
        useServiceRole: true,
      });
      return;
    }
    // Refactor 2.1: if we saved draft before stage 3 failed, keep draft status so user sees translation
    if (savedDraftThisRun) {
      logger.warn(
        { projectId, chapterId, chapterTitle: chapter.title, errorMessage },
        'Editing stage failed; draft preserved'
      );
      await updateChapter(projectId, chapterId, { status: 'draft' }, token, {
        useServiceRole: true,
      });
      return;
    }
    logger.error(
      {
        err: error,
        projectId,
        chapterId,
        chapterTitle: chapter.title,
        errorMessage,
        stack: errorStack?.substring(0, 500),
      },
      `Translation error: ${errorMessage}`
    );

    // Try to preserve existing translation if any (service role so expired JWT doesn't lose the error state)
    const currentChapter = await getChapter(projectId, chapterId, token, { useServiceRole: true });
    const existingTranslation = currentChapter?.translatedText;

    await updateChapter(
      projectId,
      chapterId,
      {
        translatedText: existingTranslation || `❌ Ошибка перевода: ${errorMessage}`,
        status: 'error',
      },
      token,
      { useServiceRole: true }
    );

    logger.warn(
      {
        projectId,
        chapterId,
        chapterTitle: chapter.title,
        existingTranslation: !!existingTranslation,
      },
      'Chapter marked as error; existing translation preserved'
    );
  } finally {
    try {
      await invalidateProjectAndRelatedCaches(userId, projectId, token, {
        useServiceRole: true,
      });
    } catch (error) {
      logger.warn({ err: error, userId, projectId }, 'Cache invalidation after translation failed');
    }
    translationCancelRegistry.delete(cancelKey);
    clearTranslationProgress(projectId, chapterId);
  }
}

export function logTranslationCoverageIfIncomplete(
  projectId: string,
  chapterId: string,
  paragraphs: Paragraph[]
): ReturnType<typeof getTranslationCoverage> {
  const coverage = getTranslationCoverage(paragraphs);
  if (!coverage.isComplete) {
    logger.warn(
      {
        event: 'translation.incomplete',
        projectId,
        chapterId,
        contentTotal: coverage.contentTotal,
        translatedCount: coverage.translatedCount,
        missingCount: coverage.missingParagraphIds.length,
      },
      'Translation incomplete: not all paragraphs filled'
    );
  }
  logSuspectTruncationsAfterSync(projectId, chapterId, paragraphs);
  return coverage;
}

/**
 * Sync translated text to paragraph structure
 * Tries to match translated paragraphs to original ones
 * Improved to handle cases where paragraph count doesn't match
 * Preserves existing translations for paragraphs that already have valid translations (unless replaceAll=true)
 *
 * @param replaceAll - If true, replace all paragraphs with new translation (for uploaded translation)
 * @param editedBy - 'ai' for pipeline translation, 'user' for uploaded translation
 */
export function syncTranslationToParagraphs(
  originalParagraphs: Paragraph[],
  translatedText: string,
  options?: { replaceAll?: boolean; editedBy?: 'ai' | 'user' }
): Paragraph[] {
  const replaceAll = options?.replaceAll ?? false;
  const editedBy = options?.editedBy ?? 'ai';
  if (!originalParagraphs || originalParagraphs.length === 0) {
    logger.warn('syncTranslationToParagraphs: no original paragraphs');
    return [];
  }

  if (!translatedText || translatedText.trim().length === 0) {
    logger.warn('syncTranslationToParagraphs: translated text is empty');
    return originalParagraphs; // Return original paragraphs unchanged
  }

  // Split translated text into paragraphs
  const translatedParts = translatedText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const now = new Date().toISOString();

  // Helper function to check if paragraph is a separator
  const isSeparatorParagraph = (p: Paragraph): boolean => {
    const text = p.originalText.trim();
    if (text.length === 0) return false;
    // Check if paragraph contains only separator characters (repeated)
    const separatorPattern = /^[\s*\-_=~#]+$/;
    return separatorPattern.test(text);
  };

  // Helper function to check if paragraph has valid translation
  const hasValidTranslation = (p: Paragraph): boolean => {
    const text = p.translatedText?.trim() || '';
    if (text.length === 0) return false;
    // Ignore error messages
    if (text.startsWith('❌') || isChunkError(text)) return false;
    return true;
  };

  logger.debug(
    { originalCount: originalParagraphs.length, translatedPartsCount: translatedParts.length },
    `Sync: ${originalParagraphs.length} original paragraphs, ${translatedParts.length} translated parts`
  );

  // Count empty paragraphs that need translation (excluding separators)
  const emptyParagraphsCount = originalParagraphs.filter(
    (p) => !isSeparatorParagraph(p) && !hasValidTranslation(p)
  ).length;

  if (translatedParts.length !== originalParagraphs.length) {
    logger.debug(
      {
        original: originalParagraphs.length,
        translatedParts: translatedParts.length,
        emptyCount: emptyParagraphsCount,
      },
      'Count mismatch: original vs translated parts'
    );
    if (translatedParts.length !== emptyParagraphsCount) {
      logger.warn(
        { translatedParts: translatedParts.length, emptyParagraphsCount },
        'Translated parts count does not match empty paragraphs count'
      );
    }
  }

  // Map translations to original paragraphs
  // Preserve existing valid translations, only update empty or error paragraphs
  // Use relative index for empty paragraphs instead of direct mapping
  let translationIndex = 0; // Relative index in translatedParts array

  const result = originalParagraphs.map((original) => {
    // Skip separator paragraphs - they don't need translation
    if (isSeparatorParagraph(original)) {
      return original; // Keep separator paragraph as-is, don't try to translate it
    }

    // If paragraph already has valid translation, preserve it (unless replaceAll)
    if (!replaceAll && hasValidTranslation(original)) {
      return original; // Keep existing translation, skip it in translation mapping
    }

    // Otherwise, get next available translation using relative index
    if (translationIndex < translatedParts.length) {
      const translatedPart = translatedParts[translationIndex];
      translationIndex++; // Move to next translation

      // Update paragraph with new translation
      if (translatedPart && translatedPart.trim().length > 0) {
        return {
          ...original,
          translatedText: translatedPart,
          status: 'translated' as const,
          editedAt: now,
          editedBy,
        };
      }
    }

    // Keep original if no new translation available
    return original;
  });

  // Handle edge cases
  const translatedCount = result.filter((p) => hasValidTranslation(p)).length;
  const preservedCount = originalParagraphs.filter((p) => hasValidTranslation(p)).length;
  const newTranslations = translatedCount - preservedCount;
  const emptyCount = originalParagraphs.length - preservedCount;

  if (translationIndex < translatedParts.length) {
    const unusedCount = translatedParts.length - translationIndex;
    logger.warn(
      { unusedCount, translatedPartsCount: translatedParts.length },
      'Not all translations used; possible format mismatch'
    );
  }

  if (newTranslations < emptyCount && translationIndex >= translatedParts.length) {
    const missingCount = emptyCount - newTranslations;
    logger.warn(
      { newTranslations, emptyCount, missingCount },
      'Not all empty paragraphs received translation'
    );
  }

  logger.debug(
    { translatedCount, total: originalParagraphs.length, preservedCount, newTranslations },
    `Synced: ${translatedCount}/${originalParagraphs.length} paragraphs have translation`
  );

  if (translatedCount === 0 && translatedText.trim().length > 0) {
    logger.error(
      {
        translatedTextLength: translatedText.length,
        translatedPartsLength: translatedParts.length,
        emptyCount,
      },
      'Critical: entire translation lost during sync'
    );
  }

  if (emptyCount > 0 && newTranslations === 0 && translatedText.trim().length > 0) {
    logger.error(
      { emptyCount, translatedPartsLength: translatedParts.length },
      'Translation received but not applied to any paragraph'
    );
  }

  return result;
}

/**
 * Sync translated chunks to paragraph structure (mechanical sync stage)
 * Uses saved translatedChunks instead of splitting text
 * Follows the same logic as syncTranslationToParagraphs but works with pre-parsed chunks
 *
 * @param originalParagraphs - Original paragraphs to sync with
 * @param translatedChunks - Translated chunks to map to paragraphs
 * @param partialTranslation - If true, only empty paragraphs will be updated (for translateOnlyEmpty mode)
 */
export function syncTranslationChunksToParagraphs(
  originalParagraphs: Paragraph[],
  translatedChunks: string[],
  partialTranslation: boolean = false
): Paragraph[] {
  if (!originalParagraphs || originalParagraphs.length === 0) {
    logger.warn('syncTranslationChunksToParagraphs: no original paragraphs');
    return [];
  }

  if (!translatedChunks || translatedChunks.length === 0) {
    logger.warn('syncTranslationChunksToParagraphs: no translated chunks');
    return originalParagraphs;
  }

  const now = new Date().toISOString();

  // Helper function to check if paragraph is a separator
  const isSeparatorParagraph = (p: Paragraph): boolean => {
    const text = p.originalText.trim();
    if (text.length === 0) return false;
    // Check if paragraph contains only separator characters (repeated)
    const separatorPattern = /^[\s*\-_=~#]+$/;
    return separatorPattern.test(text);
  };

  // Helper function to check if paragraph has valid translation
  const hasValidTranslation = (p: Paragraph): boolean => {
    const text = p.translatedText?.trim() || '';
    if (text.length === 0) return false;
    // Ignore error messages
    if (text.startsWith('❌') || isChunkError(text)) return false;
    return true;
  };

  logger.debug(
    { originalCount: originalParagraphs.length, chunksCount: translatedChunks.length },
    `Chunk sync: ${originalParagraphs.length} original paragraphs, ${translatedChunks.length} chunks`
  );

  // Normalize chunk count to avoid shift/loss: editing often returns more \n\n-separated blocks
  // than paragraphs. Merge excess into the last content chunk so we don't lose the tail.
  const contentParagraphCount = originalParagraphs.filter((p) => !isSeparatorParagraph(p)).length;
  let chunksToUse = translatedChunks;
  if (translatedChunks.length > contentParagraphCount && contentParagraphCount > 0) {
    const head = translatedChunks.slice(0, contentParagraphCount - 1);
    const tail = translatedChunks.slice(contentParagraphCount - 1).join('\n\n');
    chunksToUse = [...head, tail];
    logger.info(
      {
        hadChunks: translatedChunks.length,
        contentParagraphs: contentParagraphCount,
        event: 'chunk_sync.normalized_excess',
      },
      'Chunk sync: merged excess chunks into last paragraph to avoid content loss'
    );
  }

  const emptyParagraphsCount = originalParagraphs.filter(
    (p) => !isSeparatorParagraph(p) && !hasValidTranslation(p)
  ).length;

  if (chunksToUse.length !== originalParagraphs.length) {
    logger.debug(
      {
        original: originalParagraphs.length,
        chunks: chunksToUse.length,
        emptyCount: emptyParagraphsCount,
      },
      'Chunk count mismatch'
    );
    if (chunksToUse.length !== emptyParagraphsCount) {
      logger.warn(
        { translatedChunks: chunksToUse.length, emptyParagraphsCount },
        'Chunk count does not match empty paragraphs count'
      );
    }
  }

  // Map translations to original paragraphs
  // For partial translation: preserve existing valid translations, only update empty or error paragraphs
  // For full translation: update all paragraphs regardless of existing translations
  let translationIndex = 0; // Relative index in chunksToUse array

  const result = originalParagraphs.map((original) => {
    // Skip separator paragraphs - they don't need translation
    // This handles cases where old chapters have separator paragraphs that weren't filtered
    if (isSeparatorParagraph(original)) {
      return original; // Keep separator paragraph as-is, don't try to translate it
    }

    // If partial translation mode, preserve existing valid translations
    if (partialTranslation && hasValidTranslation(original)) {
      return original; // Keep existing translation, skip it in translation mapping
    }

    // Otherwise, get next available translation using relative index
    if (translationIndex < chunksToUse.length) {
      const translatedChunk = chunksToUse[translationIndex];
      translationIndex++; // Move to next translation

      // Update paragraph with new translation
      if (translatedChunk && translatedChunk.trim().length > 0) {
        return {
          ...original,
          translatedText: translatedChunk,
          status: 'translated' as const,
          editedAt: now,
          editedBy: 'ai' as const,
        };
      }
    }

    // Keep original if no new translation available
    // For full translation, if we run out of chunks but there are more paragraphs,
    // this indicates a problem (shouldn't happen in normal operation)
    return original;
  });

  // Handle edge cases
  const translatedCount = result.filter((p) => hasValidTranslation(p)).length;
  const preservedCount = originalParagraphs.filter((p) => hasValidTranslation(p)).length;
  const newTranslations = translatedCount - preservedCount;
  const emptyCount = originalParagraphs.length - preservedCount;

  if (translationIndex < chunksToUse.length) {
    const unusedCount = chunksToUse.length - translationIndex;
    logger.warn(
      { unusedCount, translatedChunksCount: chunksToUse.length },
      'Not all chunks used; possible format mismatch'
    );
  }

  if (
    !partialTranslation &&
    newTranslations < emptyCount &&
    translationIndex >= chunksToUse.length
  ) {
    const missingCount = emptyCount - newTranslations;
    logger.warn(
      { newTranslations, emptyCount, missingCount },
      'Not all empty paragraphs received translation'
    );
  } else if (partialTranslation && newTranslations < emptyCount) {
    logger.debug(
      { newTranslations, emptyCount, preservedCount },
      `Partial translation: ${newTranslations} of ${emptyCount} empty paragraphs filled`
    );
  }

  logger.debug(
    { translatedCount, total: originalParagraphs.length, preservedCount, newTranslations },
    `Chunk sync done: ${translatedCount}/${originalParagraphs.length} paragraphs have translation`
  );

  if (translatedCount === 0 && chunksToUse.length > 0 && !partialTranslation) {
    logger.error(
      { translatedChunksLength: chunksToUse.length, emptyCount },
      'Critical: entire translation lost during chunk sync'
    );
  }

  if (!partialTranslation && emptyCount > 0 && newTranslations === 0 && chunksToUse.length > 0) {
    logger.error(
      { emptyCount, translatedChunksLength: chunksToUse.length },
      'Translation received but not applied to any paragraph'
    );
  }

  return result;
}
