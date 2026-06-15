/**
 * Stage 3: Editing/Polishing
 *
 * Refines the translation to:
 * - Improve readability and flow
 * - Fix awkward phrasings
 * - Ensure consistency
 * - Polish literary quality
 */

import DiffMatchPatch from 'diff-match-patch';
import type { ILLMProvider, Message } from '../interfaces/llm-provider.js';
import type { AgentContext } from '../types/agent.js';
import type { StageResult, EditedTranslation, EditChange } from '../types/pipeline.js';
import type { TextChunk } from '../types/common.js';
import type { EditingFocus, EditingStylePreset } from '../prompts/system/editor.js';
import {
  createEditorPrompt,
  getEditorSystemPrompt,
  getQualityCheckPrompt,
} from '../prompts/system/editor.js';
import { GlossaryManager } from '../glossary/glossary-manager.js';
import { filterGlossaryForChunk, getChapterCastCharacters } from '../glossary/glossary-filter.js';
import { chunkText, mergeChunks, type MergeChunkInput } from '../utils/chunker.js';
import { languageDisplayName } from '../language.js';
import { log } from '../logger.js';

const DMP_DIFF_DELETE = -1;
const DMP_DIFF_INSERT = 1;

interface EditStageOptions {
  context: AgentContext;
  checkQuality?: boolean;
  chunkSize?: number; // Max tokens per chunk for chunked editing
  /** When false, do not include glossary in prompt (saves tokens; use larger chunks). Default true. */
  includeGlossary?: boolean;
  temperature?: number;
  /** Custom instructions for editor */
  customInstructions?: string;
  /** Editing style preset: default, literary, minimal, ai_revivification */
  editingStylePreset?: EditingStylePreset;
  /** Editing focus: fix_problems, style_only, both */
  editingFocus?: EditingFocus;
  /** Number of retries for a failed chunk (default 2 = up to 3 attempts total). */
  chunkRetryAttempts?: number;
  /** Delay in ms before each retry (default 1500). */
  chunkRetryDelayMs?: number;
  /** Check before each retry; when true, throw to cancel. */
  isCancelled?: () => boolean;
  /** When true, run quality check after chunked editing (separate request, may timeout). Default false. */
  checkQualityForChunked?: boolean;
  /** Timeout in ms for quality check when chunked. Default 30000. */
  qualityCheckTimeoutMs?: number;
  /** Called when chunk progress updates (chunksDone, totalChunks). Used for UI progress display. */
  onProgress?: (chunksDone: number, totalChunks: number) => void;
  /** Max chunks to process in parallel (default 1). Use 2-3 for faster editing; respect API rate limits. */
  parallelChunks?: number;
  /** Current chapter number — injects full chapter cast even when chunk filter omits a character. */
  chapterNumber?: number;
}

interface QualityCheckResponse {
  score: number;
  issues: string[];
  suggestions: string[];
}

export class EditStage {
  private provider: ILLMProvider;

  constructor(provider: ILLMProvider) {
    if (!provider) {
      throw new Error('EditStage: provider is required but was undefined');
    }
    if (typeof provider.complete !== 'function') {
      throw new Error(
        `EditStage: provider is missing complete method. Provider: ${JSON.stringify(provider)}`
      );
    }
    this.provider = provider;
    log.debug('EditStage initialized', {
      hasProvider: !!this.provider,
      hasComplete: typeof this.provider.complete,
    });
  }

  async execute(
    translatedText: string,
    originalText: string,
    options: EditStageOptions
  ): Promise<StageResult<EditedTranslation>> {
    const startTime = Date.now();
    let totalTokens = 0;

    if (!this.provider) {
      log.warn('EditStage.execute: provider not initialized');
      return {
        stage: 'edit',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: 'Editing provider is not initialized',
      };
    }

    if (typeof this.provider.complete !== 'function') {
      log.warn('EditStage.execute: provider missing complete method', {
        providerType: typeof this.provider,
        hasComplete: !!this.provider.complete,
      });
      return {
        stage: 'edit',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: `Editing provider is missing complete method. Provider type: ${typeof this.provider}, has complete: ${!!this.provider.complete}`,
      };
    }

    try {
      const includeGlossary = options.includeGlossary !== false;
      const fullGlossary = options.context.glossary;
      const chapterCastText =
        options.chapterNumber !== undefined
          ? GlossaryManager.toCastPromptText(
              getChapterCastCharacters(fullGlossary, options.chapterNumber)
            )
          : '';

      // Prepare style notes
      const styleNotes = this.buildStyleNotes(options.context);

      let editedText: string;
      let usedChunkedOrPairs = false;
      let glossaryTextForQuality = '';

      // Chunked or single-request editing (glossary + style only; no original text in prompt)
      const estimatedTokens = Math.ceil(translatedText.length / 4);
      const useChunkedEditing = options.chunkSize !== undefined || estimatedTokens > 3000;

      if (useChunkedEditing) {
        usedChunkedOrPairs = true;
        const chunkSize = options.chunkSize ?? 2000;
        log.debug('EditStage: using chunked editing', {
          estimatedTokens,
          chunkSize,
          includeGlossary,
        });

        const editTemp = options.temperature ?? 0.5;
        const preset = options.editingStylePreset ?? 'default';
        const focus = options.editingFocus ?? 'both';
        const retryAttempts = options.chunkRetryAttempts ?? 2;
        const retryDelayMs = options.chunkRetryDelayMs ?? 1500;
        const parallelChunks = Math.max(1, options.parallelChunks ?? 1);
        const chunkedResult = await this.editChunked(
          translatedText,
          fullGlossary,
          styleNotes,
          chunkSize,
          editTemp,
          includeGlossary,
          options.customInstructions,
          preset,
          focus,
          retryAttempts,
          retryDelayMs,
          parallelChunks,
          options.isCancelled,
          options.onProgress,
          options.context.targetLanguage,
          chapterCastText
        );

        editedText = chunkedResult.text;
        totalTokens = chunkedResult.tokensUsed;
      } else {
        log.debug('EditStage: using direct editing', { estimatedTokens });

        const targetLabel = languageDisplayName(options.context.targetLanguage);
        glossaryTextForQuality =
          includeGlossary && fullGlossary
            ? new GlossaryManager(
                filterGlossaryForChunk(translatedText, fullGlossary)
              ).toPromptText({ targetLanguageLabel: targetLabel })
            : '';

        const systemPrompt = getEditorSystemPrompt(
          options.editingStylePreset ?? 'default',
          options.editingFocus ?? 'both',
          options.context.targetLanguage
        );
        const messages: Message[] = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: createEditorPrompt(
              translatedText,
              glossaryTextForQuality,
              styleNotes,
              options.customInstructions,
              targetLabel,
              chapterCastText
            ),
          },
        ];

        const editTemp = options.temperature ?? 0.5;
        const editResponse = await this.provider.complete(messages, {
          temperature: editTemp,
          maxTokens: 8192,
        });

        totalTokens += editResponse.tokensUsed.total;
        editedText = editResponse.content.trim();
      }

      // Detect changes
      const changes = this.detectChanges(translatedText, editedText);

      // Optional quality check (only for small texts to avoid timeout)
      let qualityScore: number | undefined;

      if (options.checkQuality && !usedChunkedOrPairs) {
        // Skip quality check for chunked editing to avoid timeout
        try {
          const qualityResult = await this.checkQuality(
            editedText,
            originalText,
            glossaryTextForQuality,
            options.context.targetLanguage
          );
          totalTokens += qualityResult.tokensUsed;
          qualityScore = qualityResult.score;
        } catch (qualityError) {
          log.warn(
            'EditStage: quality check failed',
            qualityError instanceof Error ? qualityError : undefined
          );
        }
      } else if (options.checkQuality && usedChunkedOrPairs) {
        if (options.checkQualityForChunked) {
          try {
            const timeoutMs = options.qualityCheckTimeoutMs ?? 30000;
            const glossaryForQuality =
              includeGlossary && fullGlossary
                ? new GlossaryManager(
                    filterGlossaryForChunk(editedText, fullGlossary)
                  ).toPromptText({
                    targetLanguageLabel: languageDisplayName(options.context.targetLanguage),
                  })
                : '';
            const qualityPromise = this.checkQuality(
              editedText,
              originalText,
              glossaryForQuality,
              options.context.targetLanguage
            );
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Quality check timeout')), timeoutMs)
            );
            const qualityResult = await Promise.race([qualityPromise, timeoutPromise]);
            totalTokens += qualityResult.tokensUsed;
            qualityScore = qualityResult.score;
          } catch (qualityError) {
            log.warn(
              'EditStage: quality check failed for chunked editing',
              qualityError instanceof Error ? qualityError : undefined
            );
          }
        } else {
          log.debug(
            'EditStage: quality check skipped for chunked editing (checkQualityForChunked not set)'
          );
        }
      }

      return {
        stage: 'edit',
        success: true,
        data: {
          finalText: editedText,
          changes,
          qualityScore,
        },
        tokensUsed: totalTokens,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(`EditStage.execute failed: ${errMsg}`, error instanceof Error ? error : undefined);
      return {
        stage: 'edit',
        success: false,
        error: errMsg,
        tokensUsed: totalTokens,
        duration: Date.now() - startTime,
      };
    }
  }

  private buildStyleNotes(context: AgentContext): string {
    const { styleProfile } = context;
    const notes: string[] = [];

    if (styleProfile.tone) {
      notes.push(`Сохраняйте тон: ${styleProfile.tone}`);
    }
    if (styleProfile.dialogueStyle) {
      notes.push(`Стиль диалогов: ${styleProfile.dialogueStyle}`);
    }
    if (styleProfile.writingStyle) {
      notes.push(`Особенности автора: ${styleProfile.writingStyle}`);
    }

    return notes.join('\n');
  }

  private detectChanges(before: string, after: string): EditChange[] {
    if (!before.trim() && !after.trim()) return [];
    if (!before.trim())
      return [
        {
          before: '',
          after: after.slice(0, 100) + (after.length > 100 ? '...' : ''),
          reason: 'Editorial improvement',
        },
      ];
    if (!after.trim())
      return [
        {
          before: before.slice(0, 100) + (before.length > 100 ? '...' : ''),
          after: '',
          reason: 'Editorial improvement',
        },
      ];

    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(before, after);
    dmp.diff_cleanupSemantic(diffs);

    const changes: EditChange[] = [];
    let pendingDelete = '';
    let pendingInsert = '';

    for (const [op, text] of diffs) {
      if (op === DMP_DIFF_DELETE) {
        pendingDelete += text;
      } else if (op === DMP_DIFF_INSERT) {
        pendingInsert += text;
      } else {
        if (pendingDelete || pendingInsert) {
          const beforeSnippet =
            pendingDelete.slice(0, 100) + (pendingDelete.length > 100 ? '...' : '');
          const afterSnippet =
            pendingInsert.slice(0, 100) + (pendingInsert.length > 100 ? '...' : '');
          if (beforeSnippet || afterSnippet) {
            changes.push({
              before: beforeSnippet,
              after: afterSnippet,
              reason: 'Editorial improvement',
            });
          }
          pendingDelete = '';
          pendingInsert = '';
        }
      }
    }

    if (pendingDelete || pendingInsert) {
      const beforeSnippet = pendingDelete.slice(0, 100) + (pendingDelete.length > 100 ? '...' : '');
      const afterSnippet = pendingInsert.slice(0, 100) + (pendingInsert.length > 100 ? '...' : '');
      if (beforeSnippet || afterSnippet) {
        changes.push({
          before: beforeSnippet,
          after: afterSnippet,
          reason: 'Editorial improvement',
        });
      }
    }

    return changes;
  }

  /**
   * Edit translation using chunked approach (translated text only; glossary + style in prompt).
   * Glossary is filtered per chunk to reduce token usage.
   */
  private async editChunked(
    translatedText: string,
    fullGlossary: import('../types/agent.js').AgentContext['glossary'],
    styleNotes: string,
    chunkSize: number,
    temperature: number = 0.5,
    includeGlossary: boolean = true,
    customInstructions?: string,
    editingStylePreset: EditingStylePreset = 'default',
    editingFocus: EditingFocus = 'both',
    retryAttempts: number = 2,
    retryDelayMs: number = 1500,
    parallelChunks: number = 1,
    isCancelled?: () => boolean,
    onProgress?: (chunksDone: number, totalChunks: number) => void,
    targetLanguage?: import('../types/common.js').Language,
    chapterCastText?: string
  ): Promise<{ text: string; tokensUsed: number }> {
    const translatedChunks = chunkText(translatedText, {
      maxTokens: chunkSize,
      preserveParagraphs: true,
    });

    log.info(`EditStage: split into ${translatedChunks.length} chunks for editing`, {
      chunksCount: translatedChunks.length,
      retryAttempts,
      retryDelayMs,
      parallelChunks,
    });

    onProgress?.(0, translatedChunks.length);

    const editedChunks: MergeChunkInput[] = new Array(translatedChunks.length);
    let totalTokensUsed = 0;

    const editOne = async (
      chunk: TextChunk,
      i: number
    ): Promise<{ result: MergeChunkInput; tokensUsed: number }> => {
      return this.editChunkWithRetry(chunk, i, translatedChunks.length, {
        fullGlossary,
        styleNotes,
        temperature,
        includeGlossary,
        customInstructions,
        editingStylePreset,
        editingFocus,
        retryAttempts,
        retryDelayMs,
        isCancelled,
        targetLanguage,
        chapterCastText,
      });
    };

    if (parallelChunks <= 1) {
      for (let i = 0; i < translatedChunks.length; i++) {
        if (isCancelled?.()) {
          throw new Error('Cancelled');
        }
        const { result, tokensUsed: tok } = await editOne(translatedChunks[i]!, i);
        editedChunks[i] = result;
        totalTokensUsed += tok;
        onProgress?.(i + 1, translatedChunks.length);
      }
    } else {
      for (let batchStart = 0; batchStart < translatedChunks.length; batchStart += parallelChunks) {
        if (isCancelled?.()) {
          throw new Error('Cancelled');
        }
        const batchEnd = Math.min(batchStart + parallelChunks, translatedChunks.length);
        const batchPromises = translatedChunks
          .slice(batchStart, batchEnd)
          .map((chunk, batchIdx) => editOne(chunk, batchStart + batchIdx));
        const settled = await Promise.allSettled(batchPromises);
        for (let j = 0; j < settled.length; j++) {
          const s = settled[j]!;
          if (s.status === 'fulfilled') {
            editedChunks[batchStart + j] = s.value.result;
            totalTokensUsed += s.value.tokensUsed;
          } else {
            throw s.reason;
          }
        }
        onProgress?.(batchEnd, translatedChunks.length);
      }
    }

    log.info('EditStage: all chunks edited', { chunksCount: editedChunks.length, totalTokensUsed });

    // Merge edited chunks back together
    const finalText = mergeChunks(editedChunks);

    if (!finalText || finalText.trim().length === 0) {
      log.error('EditStage: critical - final edited text empty after merge', {
        chunksCount: editedChunks.length,
      });
      return { text: translatedText, tokensUsed: totalTokensUsed };
    }

    log.debug('EditStage: final edited text length', { length: finalText.length });

    return { text: finalText, tokensUsed: totalTokensUsed };
  }

  /**
   * Edit a single chunk with retry logic. Returns MergeChunkInput (original content on failure).
   */
  private async editChunkWithRetry(
    chunk: TextChunk,
    chunkIndex: number,
    chunkTotal: number,
    opts: {
      fullGlossary: import('../types/agent.js').AgentContext['glossary'];
      styleNotes: string;
      temperature: number;
      includeGlossary: boolean;
      customInstructions?: string;
      editingStylePreset: EditingStylePreset;
      editingFocus: EditingFocus;
      retryAttempts: number;
      retryDelayMs: number;
      isCancelled?: () => boolean;
      targetLanguage?: import('../types/common.js').Language;
      chapterCastText?: string;
    }
  ): Promise<{ result: MergeChunkInput; tokensUsed: number }> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= opts.retryAttempts; attempt++) {
      if (attempt > 0) {
        if (opts.isCancelled?.()) throw new Error('Cancelled');
        log.warn('EditStage: chunk retry after failure', {
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
        const editResult = await this.editChunk(
          chunk,
          opts.fullGlossary,
          opts.styleNotes,
          opts.temperature,
          opts.includeGlossary,
          opts.customInstructions,
          opts.editingStylePreset,
          opts.editingFocus,
          opts.targetLanguage,
          opts.chapterCastText
        );

        if (!editResult.text || editResult.text.trim().length === 0) {
          log.warn(`EditStage: chunk ${chunkIndex + 1} returned empty edit`);
          return {
            result: {
              content: chunk.content,
              index: chunk.index,
              separatorAfter: chunk.separatorAfter,
            },
            tokensUsed: editResult.tokensUsed,
          };
        }

        log.debug(`EditStage: chunk ${chunkIndex + 1} edited`, {
          length: editResult.text.length,
          tokensUsed: editResult.tokensUsed,
        });
        return {
          result: {
            content: editResult.text,
            index: chunk.index,
            separatorAfter: chunk.separatorAfter,
          },
          tokensUsed: editResult.tokensUsed,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < opts.retryAttempts) {
          log.info('EditStage: chunk attempt failed, will retry', {
            chunkIndex: chunkIndex + 1,
            chunkTotal,
            attempt: attempt + 1,
            maxAttempts: opts.retryAttempts + 1,
            errMessage: lastError.message,
          });
        }
        if (attempt === opts.retryAttempts) {
          log.error(
            `EditStage: chunk ${chunkIndex + 1} edit failed after ${opts.retryAttempts + 1} attempts: ${lastError.message}`,
            lastError
          );
          return {
            result: {
              content: chunk.content,
              index: chunk.index,
              separatorAfter: chunk.separatorAfter,
            },
            tokensUsed: 0,
          };
        }
      }
    }
    throw lastError ?? new Error('Edit failed');
  }

  /**
   * Edit a single chunk of translated text (glossary + style only; no original in prompt).
   * Glossary is filtered to entries that appear in this chunk.
   */
  private async editChunk(
    translatedChunk: TextChunk,
    fullGlossary: import('../types/agent.js').AgentContext['glossary'],
    styleNotes: string,
    temperature: number = 0.5,
    includeGlossary: boolean = true,
    customInstructions?: string,
    editingStylePreset: EditingStylePreset = 'default',
    editingFocus: EditingFocus = 'both',
    targetLanguage?: import('../types/common.js').Language,
    chapterCastText?: string
  ): Promise<{ text: string; tokensUsed: number }> {
    const targetLabel = targetLanguage ? languageDisplayName(targetLanguage) : undefined;
    const glossaryText =
      includeGlossary && fullGlossary
        ? new GlossaryManager(
            filterGlossaryForChunk(translatedChunk.content, fullGlossary)
          ).toPromptText({ targetLanguageLabel: targetLabel })
        : '';

    const systemPrompt = getEditorSystemPrompt(editingStylePreset, editingFocus, targetLanguage);
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: createEditorPrompt(
          translatedChunk.content,
          glossaryText,
          styleNotes,
          customInstructions,
          targetLabel,
          chapterCastText
        ),
      },
    ];

    const editResponse = await this.provider.complete(messages, {
      temperature,
      maxTokens: 8192,
    });

    return {
      text: editResponse.content.trim(),
      tokensUsed: editResponse.tokensUsed?.total || 0,
    };
  }

  private async checkQuality(
    translatedText: string,
    originalText: string,
    glossaryText: string,
    targetLanguage?: import('../types/common.js').Language
  ): Promise<{ score: number; tokensUsed: number }> {
    const messages: Message[] = [
      { role: 'system', content: getQualityCheckPrompt(targetLanguage) },
      {
        role: 'user',
        content: `## Original\n${originalText}\n\n## Translation\n${translatedText}\n\n## Glossary\n${glossaryText}`,
      },
    ];

    try {
      const response = await this.provider.completeJSON<QualityCheckResponse>(messages, {
        temperature: 0.3,
        maxTokens: 1024,
      });

      return {
        score: response.data.score ?? 7,
        tokensUsed: response.tokensUsed.total,
      };
    } catch {
      return { score: 0, tokensUsed: 0 };
    }
  }
}
