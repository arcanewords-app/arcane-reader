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
import type { StageResult, TranslationDraft, ChunkTranslation } from '../types/pipeline.js';
import type { TextChunk } from '../types/common.js';
import { TRANSLATOR_SYSTEM_PROMPT, createTranslatorPrompt } from '../prompts/system/translator.js';
import { GlossaryManager } from '../glossary/glossary-manager.js';
import { chunkText, mergeChunks } from '../utils/chunker.js';
import { log } from '../logger.js';

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
      // Prepare glossary text (omit when editing will run to save tokens; editor stage applies glossary)
      const includeGlossary = options.includeGlossary !== false;
      const glossaryText = includeGlossary
        ? new GlossaryManager(options.context.glossary).toPromptText()
        : '';

      // Prepare context text
      const contextText = this.buildContextText(options.context);

      // Prepare style guide
      const styleGuide = this.buildStyleGuide(options.context);

      // Chunk the text — each chunk is one API request, so long chapters don't need one huge
      // timeout; slow models only need to finish one chunk per request (OPENAI_TIMEOUT_MS).
      const chunks = chunkText(sourceText, {
        maxTokens: options.chunkSize ?? 2000,
        preserveParagraphs: true,
        neverSplitParagraphs: options.neverSplitParagraphs,
      });

      const retryAttempts = options.chunkRetryAttempts ?? DEFAULT_CHUNK_RETRY_ATTEMPTS;
      const retryDelayMs = options.chunkRetryDelayMs ?? DEFAULT_CHUNK_RETRY_DELAY_MS;

      log.info('TranslateStage: starting chunked translation', {
        chunksCount: chunks.length,
        retryAttempts,
        retryDelayMs,
        chunkSize: options.chunkSize,
        includeGlossary,
      });

      // Translate each chunk
      const chunkResults: ChunkTranslation[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkStartTime = Date.now();
        log.info('TranslateStage: chunk start', {
          chunkIndex: i + 1,
          chunkTotal: chunks.length,
          chunkId: chunk.id,
          tokenCount: chunk.tokenCount,
        });

        const temperature = options.temperature ?? 0.7;
        let lastError: Error | undefined;
        let succeeded = false;

        for (let attempt = 0; attempt <= retryAttempts && !succeeded; attempt++) {
          if (attempt > 0) {
            if (options.isCancelled?.()) {
              throw new Error('Cancelled');
            }
            const errMsg = lastError?.message ?? 'unknown';
            const errName = lastError?.name ?? 'Error';
            log.warn('TranslateStage: chunk retry after failure', {
              chunkIndex: i + 1,
              chunkTotal: chunks.length,
              retryNumber: attempt,
              retryMax: retryAttempts,
              delayMs: retryDelayMs,
              errMessage: errMsg,
              errName,
              ...(lastError &&
                'type' in lastError &&
                typeof (lastError as { type: string }).type === 'string' && {
                  errType: (lastError as { type: string }).type,
                }),
            });
            if (lastError) log.warn('TranslateStage: previous error details', lastError);
            await new Promise((r) => setTimeout(r, retryDelayMs));
            if (options.isCancelled?.()) {
              throw new Error('Cancelled');
            }
          }

          try {
            const result = await this.translateChunk(
              chunk,
              glossaryText,
              contextText,
              styleGuide,
              temperature
            );

            const chunkDurationMs = Date.now() - chunkStartTime;
            if (
              !result.translation.translated ||
              result.translation.translated.trim().length === 0
            ) {
              log.warn(`TranslateStage: chunk ${i + 1} returned empty translation`, {
                chunkId: chunk.id,
              });
            } else {
              log.debug(`TranslateStage: chunk ${i + 1} translated`, {
                length: result.translation.translated.length,
              });
            }
            log.info('TranslateStage: chunk done', {
              chunkIndex: i + 1,
              chunkTotal: chunks.length,
              tokens: result.tokensUsed,
              durationMs: chunkDurationMs,
              success: true,
            });

            chunkResults.push(result.translation);
            totalTokens += result.tokensUsed;
            succeeded = true;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const errorMessage = lastError.message;
            if (attempt < retryAttempts) {
              log.info('TranslateStage: chunk attempt failed, will retry', {
                chunkIndex: i + 1,
                chunkTotal: chunks.length,
                attempt: attempt + 1,
                maxAttempts: retryAttempts + 1,
                errMessage: errorMessage,
                errName: lastError.name,
              });
            }
            if (attempt === retryAttempts) {
              const chunkDurationMs = Date.now() - chunkStartTime;
              log.error(
                `TranslateStage: chunk ${i + 1} translation failed after ${retryAttempts + 1} attempts: ${errorMessage}`,
                lastError
              );
              log.info('TranslateStage: chunk done', {
                chunkIndex: i + 1,
                chunkTotal: chunks.length,
                durationMs: chunkDurationMs,
                success: false,
                errMessage: errorMessage,
                errName: lastError.name,
              });
              chunkResults.push({
                chunkId: chunk.id,
                original: chunk.content,
                translated: `[ERROR: ${errorMessage}]`,
              });
            }
          }
        }
      }

      log.info('TranslateStage: all chunks translated', {
        chunksCount: chunkResults.length,
        totalTokens,
      });

      // Merge translated chunks
      // Extract index from chunkId (format: "chunk_0", "chunk_1", etc.)
      const chunksToMerge = chunkResults.map((c) => {
        const indexMatch = c.chunkId.match(/chunk_(\d+)/);
        const index = indexMatch ? parseInt(indexMatch[1], 10) : -1;

        if (index === -1) {
          log.error(`TranslateStage: failed to extract index from chunkId: ${c.chunkId}`);
        }

        return {
          content: c.translated,
          index: index,
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

  private async translateChunk(
    chunk: TextChunk,
    glossaryText: string,
    contextText: string,
    styleGuide: string,
    temperature: number = 0.7
  ): Promise<{ translation: ChunkTranslation; tokensUsed: number }> {
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

    const messages: Message[] = [
      { role: 'system', content: TRANSLATOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: createTranslatorPrompt(chunk.content, glossaryText, contextText, styleGuide),
      },
    ];

    let translatedText = '';
    let tokensUsed = 0;

    // Primary path: JSON (model returns paragraphs array; we merge with \n\n)
    if (supportsJSON) {
      try {
        const response = await this.provider.completeJSON<{
          paragraphs: Array<{ id: string; translated: string }>;
        }>(messages, {
          temperature,
          maxTokens: 8192,
        });

        // Extract translations from JSON structure
        if (response.data && response.data.paragraphs && Array.isArray(response.data.paragraphs)) {
          // If JSON contains multiple paragraphs, merge them
          // If only one paragraph, extract it
          if (response.data.paragraphs.length === 1) {
            translatedText = response.data.paragraphs[0].translated || '';
          } else {
            // Multiple paragraphs - merge with double newlines
            translatedText = response.data.paragraphs
              .map((p) => p.translated)
              .filter((t) => t && t.trim().length > 0)
              .join('\n\n');
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

  private buildContextText(context: AgentContext): string {
    const parts: string[] = [];

    // Recent events
    if (context.currentContext.lastEvents.length > 0) {
      parts.push('### Недавние события:');
      parts.push(context.currentContext.lastEvents.map((e) => `- ${e}`).join('\n'));
    }

    // Active characters
    if (context.currentContext.activeCharacters.length > 0) {
      parts.push('\n### Активные персонажи в сцене:');
      parts.push(context.currentContext.activeCharacters.join(', '));
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
