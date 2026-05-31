/**
 * Translation Pipeline - Orchestrates the 3-stage translation process
 *
 * Stage 1: Analyze (Agent) - Extract entities, analyze style
 * Stage 2: Translate - Accurate translation with glossary
 * Stage 3: Edit - Polish and refine
 */

import type { ILLMProvider } from '../interfaces/llm-provider.js';
import type { PipelineResult, PipelineOptions, StageResult } from '../types/pipeline.js';
import type { ChapterSummary, AnalysisResult, AgentContext } from '../types/agent.js';
import { NovelAgent } from '../agents/novel-agent.js';
import { AnalyzeStage } from '../stages/stage-1-analyze.js';
import { TranslateStage } from '../stages/stage-2-translate.js';
import { EditStage } from '../stages/stage-3-edit.js';
import { formatChunkError } from '../constants/errors.js';
import { filterGlossaryByChapter } from '../glossary/glossary-filter.js';
import { log } from '../logger.js';
import { runWithConcurrencyResilient } from '../utils/concurrency.js';

/** Default concurrency for parallel analysis. */
const DEFAULT_ANALYSIS_CONCURRENCY = 4;

/** When editing runs after translation, we omit glossary from Stage 2 and use larger chunks. */
const TRANSLATION_CHUNK_SIZE_WHEN_EDITING = 3500;
const DEFAULT_TRANSLATION_CHUNK_SIZE = 2000;
/** When editing runs without glossary in prompt, use larger chunks. */
const EDIT_CHUNK_SIZE_WITHOUT_GLOSSARY = 3500;
const DEFAULT_EDIT_CHUNK_SIZE = 2000;

export interface PipelineConfig {
  // Support both single provider (legacy) and per-stage providers
  provider?: ILLMProvider; // Legacy: single provider for all stages
  providers?: {
    analysis: ILLMProvider;
    translation: ILLMProvider;
    editing: ILLMProvider;
  };
  agent: NovelAgent;
}

export class TranslationPipeline {
  private providers: {
    analysis: ILLMProvider;
    translation: ILLMProvider;
    editing: ILLMProvider;
  };
  private agent: NovelAgent;

  private analyzeStage: AnalyzeStage;
  private translateStage: TranslateStage;
  private editStage: EditStage;

  constructor(config: PipelineConfig) {
    log.debug('Pipeline constructor: starting initialization', {
      hasProviders: !!config.providers,
      hasProvider: !!config.provider,
      hasAgent: !!config.agent,
    });

    if (config.providers) {
      log.debug('Pipeline constructor: using per-stage providers');
      this.providers = config.providers;
      log.debug('Pipeline constructor: providers assigned', {
        analysis: !!this.providers.analysis,
        translation: !!this.providers.translation,
        editing: !!this.providers.editing,
      });
    } else if (config.provider) {
      log.debug('Pipeline constructor: using legacy single provider');
      this.providers = {
        analysis: config.provider,
        translation: config.provider,
        editing: config.provider,
      };
    } else {
      throw new Error('Either provider or providers must be provided');
    }

    if (!this.providers.analysis || !this.providers.translation || !this.providers.editing) {
      log.error('Pipeline constructor: provider validation failed', {
        analysis: !!this.providers.analysis,
        translation: !!this.providers.translation,
        editing: !!this.providers.editing,
      });
      throw new Error('All stage providers must be provided');
    }

    log.debug('Pipeline constructor: validating provider methods');
    if (typeof this.providers.analysis.completeJSON !== 'function') {
      log.error('Pipeline constructor: analysis provider missing completeJSON');
      throw new Error(
        'Analysis provider is missing completeJSON method (needed for structured output)'
      );
    }
    if (typeof this.providers.translation.complete !== 'function') {
      log.error('Pipeline constructor: translation provider missing complete');
      throw new Error('Translation provider is missing complete method');
    }
    if (typeof this.providers.editing.complete !== 'function') {
      log.error('Pipeline constructor: editing provider missing complete');
      throw new Error('Editing provider is missing complete method');
    }
    if (typeof this.providers.editing.completeJSON !== 'function') {
      log.warn(
        'Pipeline constructor: editing provider missing completeJSON - quality check will be skipped'
      );
    }

    this.agent = config.agent;

    log.debug('Pipeline constructor: creating stages with validated providers', {
      analysis: !!this.providers.analysis,
      translation: !!this.providers.translation,
      editing: !!this.providers.editing,
    });

    if (!this.providers.analysis) {
      throw new Error('Analysis provider is undefined before stage creation');
    }
    if (!this.providers.translation) {
      throw new Error('Translation provider is undefined before stage creation');
    }
    if (!this.providers.editing) {
      throw new Error('Editing provider is undefined before stage creation');
    }

    log.debug('Pipeline constructor: creating AnalyzeStage');
    this.analyzeStage = new AnalyzeStage(this.providers.analysis);
    log.debug('Pipeline constructor: AnalyzeStage created');

    log.debug('Pipeline constructor: creating TranslateStage');
    this.translateStage = new TranslateStage(this.providers.translation);
    log.debug('Pipeline constructor: TranslateStage created');

    log.debug('Pipeline constructor: creating EditStage');
    this.editStage = new EditStage(this.providers.editing);
    log.debug('Pipeline constructor: EditStage created');

    log.debug('Pipeline constructor: all stages created successfully');

    if (!this.analyzeStage || !this.translateStage || !this.editStage) {
      throw new Error('Failed to create translation stages');
    }

    log.debug('Pipeline constructor: initialization complete');
  }

  /**
   * Translate a chapter through the 3-stage pipeline
   */
  async translateChapter(
    sourceText: string,
    chapterNumber: number,
    options: PipelineOptions = {}
  ): Promise<PipelineResult> {
    const checkCancelled = () => {
      if (options.isCancelled?.()) throw new Error('Cancelled');
    };
    checkCancelled();

    const startTime = Date.now();
    let totalTokens = 0;
    const context = this.agent.getContext();
    /** When !skipAnalysis, filter glossary by chapter (mentionedInChapters) for translate/edit. */
    const ctxForTranslateEdit = (): import('../types/agent.js').AgentContext => {
      const base = this.agent.getContext();
      if (options.skipAnalysis) return base;
      return { ...base, glossary: filterGlossaryByChapter(base.glossary, chapterNumber) };
    };

    const dummyStage1: StageResult<AnalysisResult> = {
      stage: 'analyze',
      success: true,
      tokensUsed: 0,
      duration: 0,
      data: undefined,
    };
    const dummyStage2 = {
      stage: 'translate' as const,
      success: true,
      tokensUsed: 0,
      duration: 0,
      data: { originalText: sourceText, translatedText: '', chunkResults: [] },
    };
    const dummyStage3 = { stage: 'edit' as const, success: true, tokensUsed: 0, duration: 0 };

    // ============ RUN STAGES (multi-select or single) ============
    const runStages = options.runStages;
    const onlyAnalysis =
      (runStages?.length === 1 && runStages[0] === 'analysis') ||
      options.runOnlyStage === 'analysis';
    const onlyEditing =
      (runStages?.length === 1 && runStages[0] === 'editing') ||
      (options.runOnlyStage === 'editing' && options.existingTranslatedTextForEdit != null);

    if (onlyAnalysis) {
      log.info(`Pipeline: run only analysis (chapter ${chapterNumber})`, {
        sourceTextLength: sourceText.length,
      });
      const stage1Result = await this.analyzeStage.execute(sourceText, {
        chapterNumber,
        sourceLanguage: context.sourceLanguage,
        targetLanguage: context.targetLanguage,
        existingGlossary: context.glossary,
        temperature: options.temperatureByStage?.analysis,
        maxSectionTokens: options.analysisMaxSectionTokens,
      });
      checkCancelled();
      totalTokens += stage1Result.tokensUsed;
      if (stage1Result.success && stage1Result.data) {
        this.agent.applyAnalysisResult(stage1Result.data);
        log.info('Pipeline: Stage 1 complete', {
          characters: stage1Result.data.foundCharacters.length,
          terms: stage1Result.data.foundTerms.length,
        });
      }
      return {
        chapterNumber,
        originalText: sourceText,
        stage1: stage1Result,
        stage2: dummyStage2,
        stage3: dummyStage3,
        finalTranslation: '', // No translation; server only saves glossary
        totalTokensUsed: totalTokens,
        totalDuration: Date.now() - startTime,
        updatedContext: this.agent.getContext(),
      };
    }

    if (onlyEditing) {
      const existingText = options.existingTranslatedTextForEdit ?? '';
      log.info(`Pipeline: run only editing (chapter ${chapterNumber})`);
      const onlyEditIncludeGlossary = options.includeGlossaryInEditing !== false;
      const onlyEditChunkSize =
        options.chunkSize ??
        (onlyEditIncludeGlossary ? DEFAULT_EDIT_CHUNK_SIZE : EDIT_CHUNK_SIZE_WITHOUT_GLOSSARY);
      const stage3Result = await this.editStage.execute(existingText, sourceText, {
        context: ctxForTranslateEdit(),
        checkQuality: true,
        chunkSize: onlyEditChunkSize,
        includeGlossary: onlyEditIncludeGlossary,
        temperature: options.temperatureByStage?.editing,
        customInstructions: options.customInstructions?.editing,
        editingStylePreset: options.editingStylePreset,
        editingFocus: options.editingFocus,
        chunkRetryAttempts: options.retryAttempts ?? 2,
        chunkRetryDelayMs: options.chunkRetryDelayMs ?? 1500,
        parallelChunks: options.parallelChunks,
        isCancelled: options.isCancelled,
        checkQualityForChunked: options.checkQualityForChunked,
        qualityCheckTimeoutMs: options.qualityCheckTimeoutMs,
        onProgress: options.onProgress
          ? (d, t) => options.onProgress?.(d, t, 'editing')
          : undefined,
      });
      totalTokens += stage3Result.tokensUsed;
      const finalTranslation =
        stage3Result.success && stage3Result.data ? stage3Result.data.finalText : existingText;
      return {
        chapterNumber,
        originalText: sourceText,
        stage1: dummyStage1,
        stage2: { ...dummyStage2, data: { ...dummyStage2.data, translatedText: existingText } },
        stage3: stage3Result,
        finalTranslation,
        totalTokensUsed: totalTokens,
        totalDuration: Date.now() - startTime,
        updatedContext: this.agent.getContext(),
      };
    }

    // ============ STAGE 1: ANALYZE ============
    let stage1Result;
    const runStage1 = runStages
      ? runStages.includes('analysis')
      : !options.runOnlyStage && !options.skipAnalysis;
    if (runStage1) {
      log.info(`Pipeline: Stage 1 analyzing chapter ${chapterNumber}`);
      stage1Result = await this.analyzeStage.execute(sourceText, {
        chapterNumber,
        sourceLanguage: context.sourceLanguage,
        targetLanguage: context.targetLanguage,
        existingGlossary:
          options.includeGlossaryInAnalysis !== false ? context.glossary : undefined,
        temperature: options.temperatureByStage?.analysis,
        maxSectionTokens: options.analysisMaxSectionTokens,
      });
      checkCancelled();
      totalTokens += stage1Result.tokensUsed;
      if (stage1Result.success && stage1Result.data) {
        this.agent.applyAnalysisResult(stage1Result.data);
        log.info('Pipeline: Stage 1 complete', {
          characters: stage1Result.data.foundCharacters.length,
          terms: stage1Result.data.foundTerms.length,
        });
      } else {
        log.warn(`Pipeline: Stage 1 failed: ${stage1Result.error}`);
      }
      // Return partial result on cancel so server can save glossary (refactor 2.2)
      if (options.isCancelled?.()) {
        log.info('Pipeline: cancelled after Stage 1, returning partial result for glossary save');
        return {
          chapterNumber,
          originalText: sourceText,
          stage1: stage1Result,
          stage2: dummyStage2,
          stage3: dummyStage3,
          finalTranslation: '',
          totalTokensUsed: totalTokens,
          totalDuration: Date.now() - startTime,
          updatedContext: this.agent.getContext(),
          cancelled: true,
        };
      }
    } else {
      stage1Result = dummyStage1;
      if (!runStages || !runStages.includes('translation')) log.debug('Pipeline: Stage 1 skipped');
    }

    // ============ STAGE 2: TRANSLATE ============
    const runStage2 = runStages
      ? runStages.includes('translation')
      : options.runOnlyStage === 'translation' || !options.runOnlyStage;
    if (!runStage2) {
      if (runStages?.includes('editing')) {
        // Editing only: need existing text, handled above; should not reach here if onlyEditing was true
        const existing = options.existingTranslatedTextForEdit ?? '';
        if (!existing) {
          return this.createFailedResult(
            chapterNumber,
            sourceText,
            stage1Result,
            dummyStage2,
            dummyStage3,
            totalTokens,
            Date.now() - startTime,
            'Editing stage requires existing translated text or run translation first'
          );
        }
        const editOnlyIncludeGlossary = options.includeGlossaryInEditing !== false;
        const editOnlyChunkSize =
          options.chunkSize ??
          (editOnlyIncludeGlossary ? DEFAULT_EDIT_CHUNK_SIZE : EDIT_CHUNK_SIZE_WITHOUT_GLOSSARY);
        const stage3Result = await this.editStage.execute(existing, sourceText, {
          context: ctxForTranslateEdit(),
          checkQuality: true,
          chunkSize: editOnlyChunkSize,
          includeGlossary: editOnlyIncludeGlossary,
          customInstructions: options.customInstructions?.editing,
          editingStylePreset: options.editingStylePreset,
          editingFocus: options.editingFocus,
          chunkRetryAttempts: options.retryAttempts ?? 2,
          chunkRetryDelayMs: options.chunkRetryDelayMs ?? 1500,
          parallelChunks: options.parallelChunks,
          isCancelled: options.isCancelled,
          checkQualityForChunked: options.checkQualityForChunked,
          qualityCheckTimeoutMs: options.qualityCheckTimeoutMs,
          onProgress: options.onProgress
            ? (d, t) => options.onProgress?.(d, t, 'editing')
            : undefined,
        });
        totalTokens += stage3Result.tokensUsed;
        const finalTranslation =
          stage3Result.success && stage3Result.data ? stage3Result.data.finalText : existing;
        return {
          chapterNumber,
          originalText: sourceText,
          stage1: stage1Result,
          stage2: { ...dummyStage2, data: { ...dummyStage2.data, translatedText: existing } },
          stage3: stage3Result,
          finalTranslation,
          totalTokensUsed: totalTokens,
          totalDuration: Date.now() - startTime,
          updatedContext: this.agent.getContext(),
        };
      }
      return this.createFailedResult(
        chapterNumber,
        sourceText,
        stage1Result,
        dummyStage2,
        dummyStage3,
        totalTokens,
        Date.now() - startTime,
        'Editing-only requires existingTranslatedTextForEdit'
      );
    }
    const willRunEditing = runStages
      ? runStages.includes('editing')
      : !options.runOnlyStage && !options.skipEditing;
    const includeGlossaryInTranslation =
      options.includeGlossaryInTranslation === false
        ? false
        : options.includeGlossaryInTranslation === true
          ? true
          : !willRunEditing;
    const translationChunkSize =
      options.chunkSize ??
      (includeGlossaryInTranslation
        ? DEFAULT_TRANSLATION_CHUNK_SIZE
        : TRANSLATION_CHUNK_SIZE_WHEN_EDITING);
    log.info('Pipeline: Stage 2 translating', {
      chapterNumber,
      includeGlossary: includeGlossaryInTranslation,
      chunkSize: translationChunkSize,
    });
    const stage2Result = await this.translateStage.execute(sourceText, {
      context: ctxForTranslateEdit(),
      chunkSize: translationChunkSize,
      includeGlossary: includeGlossaryInTranslation,
      temperature: options.temperatureByStage?.translation,
      isCancelled: options.isCancelled,
      chunkRetryAttempts: options.retryAttempts ?? 2,
      chunkRetryDelayMs: options.chunkRetryDelayMs ?? 1500,
      neverSplitParagraphs: options.neverSplitParagraphs,
      textBlockTypes: options.textBlockTypes,
      customInstructions: options.customInstructions?.translation,
      parallelChunks: options.parallelChunks,
      onProgress: options.onProgress
        ? (d, t) => options.onProgress?.(d, t, 'translation')
        : undefined,
    });
    totalTokens += stage2Result.tokensUsed;

    if (!stage2Result.success || !stage2Result.data) {
      return this.createFailedResult(
        chapterNumber,
        sourceText,
        stage1Result,
        stage2Result,
        dummyStage3,
        totalTokens,
        Date.now() - startTime,
        `Translation failed: ${stage2Result.error}`
      );
    }
    log.info('Pipeline: Stage 2 complete', { chunks: stage2Result.data.chunkResults.length });
    checkCancelled();

    // ============ STAGE 3: EDIT ============
    let stage3Result;
    let finalTranslation: string;
    if (willRunEditing) {
      const includeGlossaryInEditing = options.includeGlossaryInEditing !== false;
      const editChunkSize =
        options.chunkSize ??
        (includeGlossaryInEditing ? DEFAULT_EDIT_CHUNK_SIZE : EDIT_CHUNK_SIZE_WITHOUT_GLOSSARY);
      log.info('Pipeline: Stage 3 editing', {
        includeGlossary: includeGlossaryInEditing,
        chunkSize: editChunkSize,
      });
      stage3Result = await this.editStage.execute(stage2Result.data.translatedText, sourceText, {
        context: ctxForTranslateEdit(),
        checkQuality: true,
        chunkSize: editChunkSize,
        includeGlossary: includeGlossaryInEditing,
        temperature: options.temperatureByStage?.editing,
        customInstructions: options.customInstructions?.editing,
        editingStylePreset: options.editingStylePreset,
        editingFocus: options.editingFocus,
        chunkRetryAttempts: options.retryAttempts ?? 2,
        chunkRetryDelayMs: options.chunkRetryDelayMs ?? 1500,
        parallelChunks: options.parallelChunks,
        isCancelled: options.isCancelled,
        checkQualityForChunked: options.checkQualityForChunked,
        qualityCheckTimeoutMs: options.qualityCheckTimeoutMs,
        onProgress: options.onProgress
          ? (d, t) => options.onProgress?.(d, t, 'editing')
          : undefined,
      });
      totalTokens += stage3Result.tokensUsed;
      if (stage3Result.success && stage3Result.data) {
        finalTranslation = stage3Result.data.finalText;
        log.info('Pipeline: Stage 3 complete', {
          qualityScore: stage3Result.data.qualityScore ?? 'N/A',
        });
      } else {
        finalTranslation = stage2Result.data.translatedText;
        log.warn(`Pipeline: Stage 3 failed, using raw translation: ${stage3Result.error}`);
      }
    } else {
      stage3Result = dummyStage3;
      finalTranslation = stage2Result.data.translatedText;
      log.debug('Pipeline: Stage 3 skipped');
    }

    // ============ RECORD CHAPTER ============
    const analysisData = stage1Result.data;
    const chapterSummary: ChapterSummary = {
      chapterNumber,
      summary: analysisData?.chapterSummary ?? '',
      keyEvents: analysisData?.keyEvents ?? [],
      activeCharacters: analysisData?.foundCharacters.map((c: { name: string }) => c.name) ?? [],
      location: analysisData?.foundLocations[0]?.name ?? '',
    };

    this.agent.recordChapterTranslation(chapterSummary);

    const totalDuration = Date.now() - startTime;
    log.info(`Pipeline: translation complete in ${(totalDuration / 1000).toFixed(1)}s`, {
      totalTokens,
      durationSec: (totalDuration / 1000).toFixed(1),
    });

    return {
      chapterNumber,
      originalText: sourceText,
      stage1: stage1Result,
      stage2: stage2Result,
      stage3: stage3Result,
      finalTranslation,
      totalTokensUsed: totalTokens,
      totalDuration,
      updatedContext: this.agent.getContext(),
    };
  }

  /**
   * Translate multiple chapters in sequence
   */
  async translateChapters(
    chapters: { text: string; number: number }[],
    options: PipelineOptions = {}
  ): Promise<PipelineResult[]> {
    const results: PipelineResult[] = [];

    for (const chapter of chapters) {
      log.debug(`Pipeline: chapter ${chapter.number}`, { chapterNumber: chapter.number });
      const result = await this.translateChapter(chapter.text, chapter.number, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Analyze multiple chapters in parallel (analysis-only stage).
   * Uses concurrency limit (default 4) to respect API rate limits.
   * All chapters receive the same glossary snapshot; results are merged and applied to agent.
   */
  async analyzeChaptersParallel(
    chapters: Array<{ text: string; number: number; id?: string }>,
    options: PipelineOptions & {
      analysisConcurrency?: number;
      onChapterComplete?: (
        chapterId: string | undefined,
        chapterNumber: number,
        result: { success: boolean; tokensUsed: number; error?: string }
      ) => void;
    } = {}
  ): Promise<{
    results: Array<{
      chapterNumber: number;
      success: boolean;
      data?: AnalysisResult;
      tokensUsed: number;
      duration: number;
      error?: string;
    }>;
    totalTokensUsed: number;
    totalDuration: number;
    updatedContext: AgentContext;
    /** Chapters that threw during analysis (resilient mode). */
    failedChapters?: Array<{ chapterNumber: number; error: string }>;
  }> {
    const startTime = Date.now();
    const context = this.agent.getContext();
    const existingGlossary =
      options.includeGlossaryInAnalysis !== false ? context.glossary : undefined;
    const concurrency = options.analysisConcurrency ?? DEFAULT_ANALYSIS_CONCURRENCY;

    log.info('Pipeline: parallel analysis', {
      chaptersCount: chapters.length,
      concurrency,
      hasGlossary: !!existingGlossary,
    });

    const onChapterComplete = options.onChapterComplete;
    const rawResults = await runWithConcurrencyResilient(
      chapters,
      concurrency,
      async (chapter) => {
        const stageResult = await this.analyzeStage.execute(chapter.text, {
          chapterNumber: chapter.number,
          sourceLanguage: this.agent.getContext().sourceLanguage,
          targetLanguage: this.agent.getContext().targetLanguage,
          existingGlossary,
          temperature: options.temperatureByStage?.analysis,
          maxSectionTokens: options.analysisMaxSectionTokens,
        });
        return {
          chapterNumber: chapter.number,
          stageResult,
        };
      },
      {
        isCancelled: options.isCancelled,
        onItemComplete: onChapterComplete
          ? (index, res) => {
              const chapter = chapters[index]!;
              const chapterNumber = chapter.number;
              const chapterId = chapter.id;
              if (res.success && res.data) {
                const { stageResult } = res.data;
                onChapterComplete(chapterId, chapterNumber, {
                  success: stageResult.success,
                  tokensUsed: stageResult.tokensUsed,
                  error: stageResult.error,
                });
              } else {
                onChapterComplete(chapterId, chapterNumber, {
                  success: false,
                  tokensUsed: 0,
                  error: res.error,
                });
              }
            }
          : undefined,
      }
    );

    const successful: AnalysisResult[] = [];
    const failedChapters: Array<{ chapterNumber: number; error: string }> = [];
    const results = rawResults.map((r, i) => {
      if (r.success && r.data) {
        const { chapterNumber, stageResult } = r.data;
        if (stageResult.success && stageResult.data) {
          successful.push(stageResult.data);
        }
        return {
          chapterNumber,
          success: stageResult.success,
          data: stageResult.data,
          tokensUsed: stageResult.tokensUsed,
          duration: stageResult.duration,
          error: stageResult.error,
        };
      }
      const chapterNumber = chapters[i]!.number;
      failedChapters.push({ chapterNumber, error: r.error ?? 'Unknown error' });
      return {
        chapterNumber,
        success: false,
        tokensUsed: 0,
        duration: 0,
        error: r.error,
      };
    });

    if (successful.length > 0) {
      successful.sort((a, b) => a.chapterNumber - b.chapterNumber);
      this.agent.applyBatchAnalysisResults(successful);
      log.info('Pipeline: batch analysis applied', {
        successfulCount: successful.length,
        failedCount: results.length - successful.length,
        failedChapters: failedChapters.length > 0 ? failedChapters : undefined,
      });
    }

    const totalTokensUsed = results.reduce((sum, r) => sum + r.tokensUsed, 0);
    const totalDuration = Date.now() - startTime;

    return {
      results,
      totalTokensUsed,
      totalDuration,
      updatedContext: this.agent.getContext(),
      ...(failedChapters.length > 0 && { failedChapters }),
    };
  }

  /**
   * Get the current agent (for saving state)
   */
  getAgent(): NovelAgent {
    return this.agent;
  }

  /**
   * Update the agent
   */
  setAgent(agent: NovelAgent): void {
    this.agent = agent;
  }

  private createFailedResult(
    chapterNumber: number,
    originalText: string,
    stage1: PipelineResult['stage1'],
    stage2: PipelineResult['stage2'],
    stage3: PipelineResult['stage3'],
    totalTokens: number,
    totalDuration: number,
    error: string
  ): PipelineResult {
    log.error('Pipeline: failed result', {
      chapterNumber,
      totalTokens,
      totalDurationMs: totalDuration,
      error,
    });
    return {
      chapterNumber,
      originalText,
      stage1,
      stage2,
      stage3,
      finalTranslation: formatChunkError(error),
      totalTokensUsed: totalTokens,
      totalDuration,
      updatedContext: this.agent.getContext(),
    };
  }
}
