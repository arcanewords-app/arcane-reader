/**
 * Stage 3: Editing/Polishing
 *
 * Refines the translation to:
 * - Improve readability and flow
 * - Fix awkward phrasings
 * - Ensure consistency
 * - Polish literary quality
 */

import type { ILLMProvider, Message } from '../interfaces/llm-provider.js';
import type { AgentContext } from '../types/agent.js';
import type { StageResult, EditedTranslation, EditChange } from '../types/pipeline.js';
import type { TextChunk } from '../types/common.js';
import {
  EDITOR_SYSTEM_PROMPT,
  createEditorPrompt,
  QUALITY_CHECK_PROMPT,
} from '../prompts/system/editor.js';
import { GlossaryManager } from '../glossary/glossary-manager.js';
import { filterGlossaryForChunk } from '../glossary/glossary-filter.js';
import { chunkText, mergeChunks } from '../utils/chunker.js';
import { log } from '../logger.js';

interface EditStageOptions {
  context: AgentContext;
  checkQuality?: boolean;
  chunkSize?: number; // Max tokens per chunk for chunked editing
  /** When false, do not include glossary in prompt (saves tokens; use larger chunks). Default true. */
  includeGlossary?: boolean;
  temperature?: number;
  /** Custom instructions for editor */
  customInstructions?: string;
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
        const chunkedResult = await this.editChunked(
          translatedText,
          fullGlossary,
          styleNotes,
          chunkSize,
          editTemp,
          includeGlossary,
          options.customInstructions
        );

        editedText = chunkedResult.text;
        totalTokens = chunkedResult.tokensUsed;
      } else {
        log.debug('EditStage: using direct editing', { estimatedTokens });

        glossaryTextForQuality =
          includeGlossary && fullGlossary
            ? new GlossaryManager(
                filterGlossaryForChunk(translatedText, fullGlossary)
              ).toPromptText()
            : '';

        const messages: Message[] = [
          { role: 'system', content: EDITOR_SYSTEM_PROMPT },
          {
            role: 'user',
            content: createEditorPrompt(
              translatedText,
              glossaryTextForQuality,
              styleNotes,
              options.customInstructions
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
            glossaryTextForQuality
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
        log.debug('EditStage: quality check skipped for chunked/pairs editing to avoid timeouts');
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
    // Simple change detection - compare paragraphs
    const changes: EditChange[] = [];

    const beforeParagraphs = before.split(/\n\n+/);
    const afterParagraphs = after.split(/\n\n+/);

    // For now, just note if there were changes
    // A more sophisticated diff could be implemented
    for (let i = 0; i < Math.max(beforeParagraphs.length, afterParagraphs.length); i++) {
      const beforeP = beforeParagraphs[i]?.trim() ?? '';
      const afterP = afterParagraphs[i]?.trim() ?? '';

      if (beforeP !== afterP && beforeP && afterP) {
        changes.push({
          before: beforeP.slice(0, 100) + (beforeP.length > 100 ? '...' : ''),
          after: afterP.slice(0, 100) + (afterP.length > 100 ? '...' : ''),
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
    customInstructions?: string
  ): Promise<{ text: string; tokensUsed: number }> {
    const translatedChunks = chunkText(translatedText, {
      maxTokens: chunkSize,
      preserveParagraphs: true,
    });

    log.info(`EditStage: split into ${translatedChunks.length} chunks for editing`, {
      chunksCount: translatedChunks.length,
    });

    const editedChunks: { content: string; index: number }[] = [];
    let totalTokensUsed = 0;

    for (let i = 0; i < translatedChunks.length; i++) {
      const translatedChunk = translatedChunks[i];

      log.debug(`EditStage: editing chunk ${i + 1}/${translatedChunks.length}`, {
        chunkId: translatedChunk.id,
        tokenCount: translatedChunk.tokenCount,
      });

      try {
        const editResult = await this.editChunk(
          translatedChunk,
          fullGlossary,
          styleNotes,
          temperature,
          includeGlossary,
          customInstructions
        );

        totalTokensUsed += editResult.tokensUsed;

        if (!editResult.text || editResult.text.trim().length === 0) {
          log.warn(`EditStage: chunk ${i + 1} returned empty edit`);
          editedChunks.push({
            content: translatedChunk.content,
            index: translatedChunk.index,
          });
        } else {
          log.debug(`EditStage: chunk ${i + 1} edited`, {
            length: editResult.text.length,
            tokensUsed: editResult.tokensUsed,
          });
          editedChunks.push({
            content: editResult.text,
            index: translatedChunk.index,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log.error(
          `EditStage: chunk ${i + 1} edit failed: ${errorMessage}`,
          error instanceof Error ? error : undefined
        );

        // Use original translated chunk if editing failed
        editedChunks.push({
          content: translatedChunk.content,
          index: translatedChunk.index,
        });

        // Continue with next chunk instead of failing completely
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
   * Edit a single chunk of translated text (glossary + style only; no original in prompt).
   * Glossary is filtered to entries that appear in this chunk.
   */
  private async editChunk(
    translatedChunk: TextChunk,
    fullGlossary: import('../types/agent.js').AgentContext['glossary'],
    styleNotes: string,
    temperature: number = 0.5,
    includeGlossary: boolean = true,
    customInstructions?: string
  ): Promise<{ text: string; tokensUsed: number }> {
    const glossaryText =
      includeGlossary && fullGlossary
        ? new GlossaryManager(
            filterGlossaryForChunk(translatedChunk.content, fullGlossary)
          ).toPromptText()
        : '';

    const messages: Message[] = [
      { role: 'system', content: EDITOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: createEditorPrompt(
          translatedChunk.content,
          glossaryText,
          styleNotes,
          customInstructions
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
    glossaryText: string
  ): Promise<{ score: number; tokensUsed: number }> {
    const messages: Message[] = [
      { role: 'system', content: QUALITY_CHECK_PROMPT },
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
