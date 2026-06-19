/**
 * Stage 2: Translation
 *
 * Performs the actual translation using:
 * - Glossary for consistent terminology
 * - Context from previous chapters
 * - Style guidelines
 */

import type { ILLMProvider, Message } from '../interfaces/llm-provider.js';
import type { AgentContext } from '../types/agent.js';
import type { Glossary } from '../types/glossary.js';
import type { StageResult, TranslationDraft, ChunkTranslation } from '../types/pipeline.js';
import type { TextChunk, TextBlockType } from '../types/common.js';
import { resolvePrompts } from '../prompts/registry.js';
import { buildTranslateSystemPrompt } from '../prompts/shared/gender-agreement.js';
import {
  buildTranslatorJsonOutputFormat,
  TRANSLATOR_JSON_OUTPUT_FORMAT,
} from '../prompts/shared/translator-user.js';
import {
  TRANSLATE_COT_JSON_SCHEMA,
  type TranslateCoTResponse,
} from '../prompts/shared/translate-cot.js';
import { languageDisplayName } from '../language.js';
import { GlossaryManager, formatGenderCompactTag } from '../glossary/glossary-manager.js';
import { filterGlossaryForChunk, getChapterCastCharacters } from '../glossary/glossary-filter.js';
import { chunkText, mergeChunks } from '../utils/chunker.js';
import { getLeadingParagraphsForChunk, splitSourceParagraphs } from '../utils/leading-context.js';
import {
  resolveTranslateChunkSize,
  resolveTranslateOptimizationFlags,
  type TranslateOptimizationFlags,
} from '../translate-optimization.js';
import { formatChunkError } from '../constants/errors.js';
import { log } from '../logger.js';
import {
  jsonParagraphsHaveMarkers,
  mergeJsonParagraphsToMarkedText,
} from '../utils/para-markers.js';

interface TranslateStageOptions {
  context: AgentContext;
  chunkSize?: number;
  temperature?: number;
  /** When false, do not include glossary in prompt (saves tokens; use when Stage 3 editing will run and will apply glossary). Default true. */
  includeGlossary?: boolean;
  /** Check before each retry; when true, throw to cancel. */
  isCancelled?: () => boolean;
  /** Number of retries for a failed chunk (default 2 = up to 3 attempts total). */
  chunkRetryAttempts?: number;
  /** Delay in ms before each retry (default 1500). */
  chunkRetryDelayMs?: number;
  /** When true, never split a paragraph into smaller chunks (default true). */
  neverSplitParagraphs?: boolean;
  /** Text block types for special formatting (system messages, notes, etc.) */
  textBlockTypes?: TextBlockType[];
  /** Custom instructions for translator */
  customInstructions?: string;
  /** Max chunks to process in parallel (default 1 = sequential). Use 2-3 for faster translation; respect API rate limits. */
  parallelChunks?: number;
  /** Called when chunk progress updates (chunksDone, totalChunks). Used for UI progress display. */
  onProgress?: (chunksDone: number, totalChunks: number) => void;
  /** Current chapter number — used for chapter cast and gender context injection. */
  chapterNumber?: number;
  systemPromptOverride?: string;
  userPromptOverride?: string;
  enableTranslateFewShot?: boolean;
  enableTranslateCoT?: boolean;
  enableTranslateStructuredCoT?: boolean;
  translateLeadingContextParagraphs?: number;
  miniModelTranslationProfile?: boolean;
}

function applyCoTToSystemPrompt(systemPrompt: string, enableCoT: boolean): string {
  if (!enableCoT) return systemPrompt;
  if (systemPrompt.includes(TRANSLATOR_JSON_OUTPUT_FORMAT)) {
    return systemPrompt.replace(
      TRANSLATOR_JSON_OUTPUT_FORMAT,
      buildTranslatorJsonOutputFormat(true)
    );
  }
  return `${systemPrompt.trimEnd()}\n${buildTranslatorJsonOutputFormat(true)}`;
}

const DEFAULT_CHUNK_RETRY_ATTEMPTS = 2;
const DEFAULT_CHUNK_RETRY_DELAY_MS = 1500;

export class TranslateStage {
  private provider: ILLMProvider;

  constructor(provider: ILLMProvider) {
    if (!provider) {
      throw new Error('TranslateStage: provider is required but was undefined');
    }
    if (typeof provider.complete !== 'function') {
      throw new Error(
        `TranslateStage: provider is missing complete method. Provider: ${JSON.stringify(provider)}`
      );
    }
    this.provider = provider;
    log.debug('TranslateStage initialized', {
      hasProvider: !!this.provider,
      hasComplete: typeof this.provider.complete,
    });
  }

  async execute(
    sourceText: string,
    options: TranslateStageOptions
  ): Promise<StageResult<TranslationDraft>> {
    const startTime = Date.now();
    let totalTokens = 0;

    if (!this.provider) {
      log.warn('TranslateStage.execute: provider not initialized');
      return {
        stage: 'translate',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: 'Translation provider is not initialized',
      };
    }

    if (typeof this.provider.complete !== 'function') {
      log.warn('TranslateStage.execute: provider missing complete method', {
        providerType: typeof this.provider,
        hasComplete: !!this.provider.complete,
      });
      return {
        stage: 'translate',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: `Translation provider is missing complete method. Provider type: ${typeof this.provider}, has complete: ${!!this.provider.complete}`,
      };
    }

    try {
      // Prepare full glossary for filtering (omit when editing will run to save tokens)
      const includeGlossary = options.includeGlossary !== false;
      const fullGlossary = options.context.glossary;

      // Prepare context text
      const contextText = this.buildContextText(options.context, options.chapterNumber);

      // Prepare style guide
      const styleGuide = this.buildStyleGuide(options.context);

      const optimization = resolveTranslateOptimizationFlags({
        enableTranslateFewShot: options.enableTranslateFewShot,
        enableTranslateCoT: options.enableTranslateCoT,
        enableTranslateStructuredCoT: options.enableTranslateStructuredCoT,
        translateLeadingContextParagraphs: options.translateLeadingContextParagraphs,
        miniModelProfile: options.miniModelTranslationProfile,
        modelId: this.provider.model,
        chunkSizeOverride: options.chunkSize,
        includeGlossaryInTranslation: includeGlossary,
      });

      const effectiveChunkSize = resolveTranslateChunkSize({
        chunkSizeOverride: options.chunkSize,
        miniModelProfile: options.miniModelTranslationProfile,
        modelId: this.provider.model,
        includeGlossaryInTranslation: includeGlossary,
      });

      const sourceParagraphs = splitSourceParagraphs(sourceText);

      // Chunk the text — each chunk is one API request, so long chapters don't need one huge
      // timeout; slow models only need to finish one chunk per request (OPENAI_TIMEOUT_MS).
      const chunks = chunkText(sourceText, {
        maxTokens: effectiveChunkSize,
        preserveParagraphs: true,
        neverSplitParagraphs: options.neverSplitParagraphs,
      });

      const retryAttempts = options.chunkRetryAttempts ?? DEFAULT_CHUNK_RETRY_ATTEMPTS;
      const retryDelayMs = options.chunkRetryDelayMs ?? DEFAULT_CHUNK_RETRY_DELAY_MS;

      const parallelChunks = Math.max(1, options.parallelChunks ?? 1);
      const onProgress = options.onProgress;

      if (onProgress) {
        onProgress(0, chunks.length);
      }

      log.info('TranslateStage: starting chunked translation', {
        chunksCount: chunks.length,
        retryAttempts,
        retryDelayMs,
        parallelChunks,
        chunkSize: effectiveChunkSize,
        includeGlossary,
        enableFewShot: optimization.enableFewShot,
        enableCoT: optimization.enableCoT,
        leadingContextParagraphs: optimization.leadingContextParagraphs,
      });

      // Translate chunks (sequentially or in parallel batches)
      const chunkResults: ChunkTranslation[] = new Array(chunks.length);

      const translateOne = async (
        chunk: TextChunk,
        i: number
      ): Promise<{ translation: ChunkTranslation; tokensUsed: number }> => {
        return this.translateChunkWithRetry(chunk, i, chunks.length, {
          fullGlossary,
          contextText,
          styleGuide,
          sourceLanguage: options.context.sourceLanguage,
          targetLanguage: options.context.targetLanguage,
          temperature: options.temperature ?? 0.7,
          includeGlossary,
          textBlockTypes: options.textBlockTypes,
          customInstructions: options.customInstructions,
          retryAttempts,
          retryDelayMs,
          isCancelled: options.isCancelled,
          systemPromptOverride: options.systemPromptOverride,
          userPromptOverride: options.userPromptOverride,
          optimization,
          sourceParagraphs,
        });
      };

      if (parallelChunks <= 1) {
        for (let i = 0; i < chunks.length; i++) {
          const { translation, tokensUsed: tok } = await translateOne(chunks[i], i);
          chunkResults[i] = translation;
          totalTokens += tok;
          onProgress?.(i + 1, chunks.length);
        }
      } else {
        for (let batchStart = 0; batchStart < chunks.length; batchStart += parallelChunks) {
          if (options.isCancelled?.()) {
            throw new Error('Cancelled');
          }
          const batchEnd = Math.min(batchStart + parallelChunks, chunks.length);
          const batchPromises = chunks
            .slice(batchStart, batchEnd)
            .map((chunk, batchIdx) => translateOne(chunk, batchStart + batchIdx));
          const settled = await Promise.allSettled(batchPromises);
          for (let j = 0; j < settled.length; j++) {
            const s = settled[j]!;
            if (s.status === 'fulfilled') {
              chunkResults[batchStart + j] = s.value.translation;
              totalTokens += s.value.tokensUsed;
            } else {
              throw s.reason;
            }
          }
          onProgress?.(batchEnd, chunks.length);
        }
      }

      log.info('TranslateStage: all chunks translated', {
        chunksCount: chunkResults.length,
        totalTokens,
      });

      // Merge translated chunks
      // Extract index from chunkId (format: "chunk_0", "chunk_1", etc.)
      // Preserve separatorAfter from original chunks for accurate paragraph structure
      const chunksToMerge = chunkResults.map((c, i) => {
        const indexMatch = c.chunkId.match(/chunk_(\d+)/);
        const index = indexMatch ? parseInt(indexMatch[1], 10) : -1;

        if (index === -1) {
          log.error(`TranslateStage: failed to extract index from chunkId: ${c.chunkId}`);
        }

        return {
          content: c.translated,
          index,
          separatorAfter: chunks[i]?.separatorAfter,
        };
      });

      // Filter out invalid chunks and log
      const validChunks = chunksToMerge.filter((c) => c.index >= 0);
      if (validChunks.length !== chunkResults.length) {
        log.error(
          `TranslateStage: lost ${chunkResults.length - validChunks.length} chunks when extracting indices`
        );
      }

      log.debug('TranslateStage: merging chunks', { validChunksCount: validChunks.length });
      const translatedText = mergeChunks(validChunks);

      log.debug('TranslateStage: final translation length', { length: translatedText.length });

      if (translatedText.length === 0) {
        log.error('TranslateStage: critical - final translation empty after merging', {
          validChunksCount: validChunks.length,
        });
      }

      if (!translatedText || translatedText.trim().length === 0) {
        log.error('TranslateStage: critical - final translation empty', {
          chunksCount: chunks.length,
          chunkResultsCount: chunkResults.length,
          validChunksCount: validChunks.length,
        });

        return {
          stage: 'translate',
          success: false,
          error: 'Translation resulted in empty text after merging chunks',
          tokensUsed: totalTokens,
          duration: Date.now() - startTime,
        };
      }

      if (chunkResults.length !== chunks.length) {
        log.warn(
          `TranslateStage: chunk count mismatch: ${chunkResults.length} translated of ${chunks.length}`
        );
      }

      log.info('TranslateStage: translation completed successfully', {
        translatedLength: translatedText.length,
        sourceLength: sourceText.length,
      });

      return {
        stage: 'translate',
        success: true,
        data: {
          originalText: sourceText,
          translatedText,
          chunkResults,
        },
        tokensUsed: totalTokens,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(
        `TranslateStage.execute failed: ${errMsg}`,
        error instanceof Error ? error : undefined
      );
      return {
        stage: 'translate',
        success: false,
        error: errMsg,
        tokensUsed: totalTokens,
        duration: Date.now() - startTime,
      };
    }
  }

  private async translateChunkWithRetry(
    chunk: TextChunk,
    chunkIndex: number,
    chunkTotal: number,
    opts: {
      fullGlossary: Glossary;
      contextText: string;
      styleGuide: string;
      sourceLanguage: import('../types/common.js').Language;
      targetLanguage: import('../types/common.js').Language;
      temperature: number;
      includeGlossary: boolean;
      textBlockTypes?: TextBlockType[];
      customInstructions?: string;
      retryAttempts: number;
      retryDelayMs: number;
      isCancelled?: () => boolean;
      systemPromptOverride?: string;
      userPromptOverride?: string;
      optimization: TranslateOptimizationFlags;
      sourceParagraphs: string[];
    }
  ): Promise<{ translation: ChunkTranslation; tokensUsed: number }> {
    const chunkStartTime = Date.now();
    log.info('TranslateStage: chunk start', {
      chunkIndex: chunkIndex + 1,
      chunkTotal,
      chunkId: chunk.id,
      tokenCount: chunk.tokenCount,
    });

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= opts.retryAttempts; attempt++) {
      if (attempt > 0) {
        if (opts.isCancelled?.()) throw new Error('Cancelled');
        log.warn('TranslateStage: chunk retry after failure', {
          chunkIndex: chunkIndex + 1,
          chunkTotal,
          retryNumber: attempt,
          retryMax: opts.retryAttempts,
          delayMs: opts.retryDelayMs,
          errMessage: lastError?.message ?? 'unknown',
        });
        await new Promise((r) => setTimeout(r, opts.retryDelayMs));
        if (opts.isCancelled?.()) throw new Error('Cancelled');
      }

      try {
        const result = await this.translateChunk(
          chunk,
          opts.fullGlossary,
          opts.contextText,
          opts.styleGuide,
          opts.sourceLanguage,
          opts.targetLanguage,
          opts.temperature,
          opts.includeGlossary,
          opts.textBlockTypes,
          opts.customInstructions,
          opts.systemPromptOverride,
          opts.userPromptOverride,
          opts.optimization,
          opts.sourceParagraphs
        );

        const chunkDurationMs = Date.now() - chunkStartTime;
        if (!result.translation.translated || result.translation.translated.trim().length === 0) {
          log.warn(`TranslateStage: chunk ${chunkIndex + 1} returned empty translation`, {
            chunkId: chunk.id,
          });
        }
        log.info('TranslateStage: chunk done', {
          chunkIndex: chunkIndex + 1,
          chunkTotal,
          tokens: result.tokensUsed,
          durationMs: chunkDurationMs,
          success: true,
        });
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < opts.retryAttempts) {
          log.info('TranslateStage: chunk attempt failed, will retry', {
            chunkIndex: chunkIndex + 1,
            chunkTotal,
            attempt: attempt + 1,
            maxAttempts: opts.retryAttempts + 1,
            errMessage: lastError.message,
          });
        }
        if (attempt === opts.retryAttempts) {
          log.error(
            `TranslateStage: chunk ${chunkIndex + 1} translation failed after ${opts.retryAttempts + 1} attempts: ${lastError.message}`,
            lastError
          );
          return {
            translation: {
              chunkId: chunk.id,
              original: chunk.content,
              translated: formatChunkError(lastError.message),
              error: lastError.message,
            },
            tokensUsed: 0,
          };
        }
      }
    }
    throw lastError ?? new Error('Translation failed');
  }

  private async translateChunk(
    chunk: TextChunk,
    fullGlossary: Glossary,
    contextText: string,
    styleGuide: string,
    sourceLanguage: import('../types/common.js').Language,
    targetLanguage: import('../types/common.js').Language,
    temperature: number = 0.7,
    includeGlossary: boolean = true,
    textBlockTypes?: TextBlockType[],
    customInstructions?: string,
    systemPromptOverride?: string,
    userPromptOverride?: string,
    optimization?: TranslateOptimizationFlags,
    sourceParagraphs: string[] = []
  ): Promise<{ translation: ChunkTranslation; tokensUsed: number }> {
    const flags = optimization ?? {
      enableFewShot: false,
      enableCoT: false,
      enableStructuredCoT: false,
      leadingContextParagraphs: 0,
    };
    // Filter glossary to entries that appear in this chunk (saves tokens)
    const glossaryText =
      includeGlossary && fullGlossary
        ? new GlossaryManager(filterGlossaryForChunk(chunk.content, fullGlossary)).toPromptText({
            targetLanguageLabel: languageDisplayName(targetLanguage),
          })
        : '';

    // Validate provider before use
    if (!this.provider) {
      throw new Error('Translation provider is not initialized');
    }

    // Output format: primary = JSON with paragraphs[] (see TRANSLATOR_SYSTEM_PROMPT); fallback = plain
    // text with paragraphs separated by double newline. Server sync accepts both (ENGINE_E2E 1.3).
    const supportsJSON = typeof this.provider.completeJSON === 'function';

    if (!supportsJSON && typeof this.provider.complete !== 'function') {
      throw new Error(
        `Translation provider is missing complete or completeJSON method. Provider: ${JSON.stringify(
          this.provider
        )}`
      );
    }

    const translatorPrompts = resolvePrompts('translate', sourceLanguage, targetLanguage);
    const defaultSystem = applyCoTToSystemPrompt(
      buildTranslateSystemPrompt(translatorPrompts.systemPrompt, targetLanguage, {
        enableFewShot: flags.enableFewShot,
      }),
      flags.enableCoT
    );
    const systemPrompt = systemPromptOverride ?? defaultSystem;

    const leadingContext =
      flags.leadingContextParagraphs > 0
        ? getLeadingParagraphsForChunk(
            sourceParagraphs,
            chunk,
            flags.leadingContextParagraphs
          ).join('\n\n')
        : undefined;

    const defaultUser = translatorPrompts.createUserPrompt({
      sourceText: chunk.content,
      sourceLanguageLabel: languageDisplayName(sourceLanguage),
      targetLanguageLabel: languageDisplayName(targetLanguage),
      glossary: glossaryText,
      context: contextText,
      leadingContext,
      styleGuide,
      textBlockTypes,
      customInstructions,
      enableCoT: flags.enableCoT,
    });

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: userPromptOverride ?? defaultUser,
      },
    ];

    let translatedText = '';
    let tokensUsed = 0;

    // Primary path: JSON (model returns paragraphs array; we merge with \n\n)
    if (supportsJSON) {
      try {
        const jsonOptions = { temperature, maxTokens: 8192 };
        let response: { data: TranslateCoTResponse; tokensUsed: { total: number } };

        if (
          flags.enableCoT &&
          flags.enableStructuredCoT &&
          typeof this.provider.completeStructuredJSON === 'function'
        ) {
          response = await this.provider.completeStructuredJSON<TranslateCoTResponse>(
            messages,
            TRANSLATE_COT_JSON_SCHEMA as unknown as Record<string, unknown>,
            'translate_cot_response',
            jsonOptions
          );
        } else {
          const plain = await this.provider.completeJSON<TranslateCoTResponse>(
            messages,
            jsonOptions
          );
          response = plain;
        }

        if (flags.enableCoT && response.data?.analysis) {
          log.debug(`TranslateStage: chunk ${chunk.id} CoT analysis`, {
            notes: response.data.analysis.notes,
            glossaryCount: response.data.analysis.glossaryTermsInChunk?.length ?? 0,
          });
        }

        // Extract translations from JSON structure
        if (response.data && response.data.paragraphs && Array.isArray(response.data.paragraphs)) {
          const paras = response.data.paragraphs;
          translatedText = mergeJsonParagraphsToMarkedText(paras);
          if (jsonParagraphsHaveMarkers(paras)) {
            log.debug(`TranslateStage: chunk ${chunk.id} preserved paragraph markers via JSON`, {
              paragraphCount: paras.length,
            });
          }

          tokensUsed = response.tokensUsed?.total || 0;

          // Store JSON data in translation for later parsing
          // We'll need to modify ChunkTranslation type to store this
          if (translatedText && translatedText.trim().length > 0) {
            log.debug(`TranslateStage: chunk ${chunk.id} translated via JSON`, {
              length: translatedText.length,
            });
          }
        } else {
          throw new Error('Invalid JSON structure: missing paragraphs array');
        }
      } catch (jsonError) {
        log.warn(
          `TranslateStage: JSON translation failed for chunk ${chunk.id}, using text fallback`,
          jsonError instanceof Error ? jsonError : undefined
        );

        // Fallback: plain text (paragraphs separated by \n\n on server sync)
        if (typeof this.provider.complete === 'function') {
          const response = await this.provider.complete(messages, {
            temperature,
            maxTokens: 8192,
          });
          translatedText = response.content ? response.content.trim() : '';
          tokensUsed = response.tokensUsed?.total || 0;
        } else {
          throw new Error('JSON translation failed and text fallback not available');
        }
      }
    } else {
      // Use text format if JSON not supported
      const response = await this.provider.complete(messages, {
        temperature,
        maxTokens: 8192,
      });
      translatedText = response.content ? response.content.trim() : '';
      tokensUsed = response.tokensUsed?.total || 0;
    }

    if (!translatedText || translatedText.length === 0) {
      log.error(`TranslateStage: chunk ${chunk.id} returned empty response from provider`, {
        chunkId: chunk.id,
      });
    }

    return {
      translation: {
        chunkId: chunk.id,
        original: chunk.content,
        translated: translatedText,
      },
      tokensUsed,
    };
  }

  private buildContextText(context: AgentContext, chapterNumber?: number): string {
    const parts: string[] = [];

    if (chapterNumber !== undefined) {
      const castChars = getChapterCastCharacters(context.glossary, chapterNumber);
      const castText = GlossaryManager.toCastPromptText(castChars);
      if (castText) {
        parts.push(castText);
      }
    }

    // Recent events
    if (context.currentContext.lastEvents.length > 0) {
      parts.push('### Недавние события:');
      parts.push(context.currentContext.lastEvents.map((e) => `- ${e}`).join('\n'));
    }

    // Active characters (with gender tags when known in glossary)
    if (context.currentContext.activeCharacters.length > 0) {
      parts.push('\n### Активные персонажи в сцене:');
      const labeled = context.currentContext.activeCharacters.map((name) => {
        const char = GlossaryManager.findCharacterByName(context.glossary, name);
        if (char) {
          return `${char.translatedName} [${formatGenderCompactTag(char.gender)}]`;
        }
        return name;
      });
      parts.push(labeled.join(', '));
    }

    // Current location
    if (context.currentContext.currentLocation) {
      parts.push(`\n### Текущая локация: ${context.currentContext.currentLocation}`);
    }

    // Previous chapter summaries (last 2)
    if (context.previousChapters.length > 0) {
      parts.push('\n### Краткое содержание предыдущих глав:');
      const recentChapters = context.previousChapters.slice(-2);
      for (const ch of recentChapters) {
        parts.push(`Глава ${ch.chapterNumber}: ${ch.summary}`);
      }
    }

    return parts.join('\n');
  }

  private buildStyleGuide(context: AgentContext): string {
    const { styleProfile } = context;
    const parts: string[] = [];

    if (styleProfile.tone) {
      parts.push(`Тон: ${styleProfile.tone}`);
    }
    if (styleProfile.narrativeVoice) {
      parts.push(`Повествование: ${styleProfile.narrativeVoice}`);
    }
    if (styleProfile.dialogueStyle) {
      parts.push(`Диалоги: ${styleProfile.dialogueStyle}`);
    }
    if (styleProfile.writingStyle) {
      parts.push(`Стиль автора: ${styleProfile.writingStyle}`);
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }
}
