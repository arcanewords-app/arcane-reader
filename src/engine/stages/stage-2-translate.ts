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

interface TranslateStageOptions {
  context: AgentContext;
  chunkSize?: number;
}

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
    console.log(
      `[TranslateStage] Initialized with provider: ${!!this.provider}, has complete: ${typeof this
        .provider.complete}`
    );
  }

  async execute(
    sourceText: string,
    options: TranslateStageOptions
  ): Promise<StageResult<TranslationDraft>> {
    const startTime = Date.now();
    let totalTokens = 0;

    // Validate provider
    if (!this.provider) {
      return {
        stage: 'translate',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: 'Translation provider is not initialized',
      };
    }

    if (typeof this.provider.complete !== 'function') {
      return {
        stage: 'translate',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: `Translation provider is missing complete method. Provider type: ${typeof this
          .provider}, has complete: ${!!this.provider.complete}`,
      };
    }

    try {
      // Prepare glossary text
      const glossaryManager = new GlossaryManager(options.context.glossary);
      const glossaryText = glossaryManager.toPromptText();

      // Prepare context text
      const contextText = this.buildContextText(options.context);

      // Prepare style guide
      const styleGuide = this.buildStyleGuide(options.context);

      // Chunk the text
      const chunks = chunkText(sourceText, {
        maxTokens: options.chunkSize ?? 2000,
        preserveParagraphs: true,
      });

      console.log(`[TranslateStage] Разбито на ${chunks.length} чанков для перевода`);

      // Translate each chunk
      const chunkResults: ChunkTranslation[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`[TranslateStage] Перевод чанка ${i + 1}/${chunks.length} (ID: ${chunk.id}, токенов: ${chunk.tokenCount})`);
        
        try {
          const result = await this.translateChunk(chunk, glossaryText, contextText, styleGuide);

          if (!result.translation.translated || result.translation.translated.trim().length === 0) {
            console.warn(`[TranslateStage] ⚠️ Чанк ${i + 1} вернул пустой перевод!`);
            console.warn(`   Оригинальный текст: ${chunk.content.substring(0, 200)}...`);
          } else {
            console.log(`[TranslateStage] ✅ Чанк ${i + 1} переведен (${result.translation.translated.length} символов)`);
          }

          chunkResults.push(result.translation);
          totalTokens += result.tokensUsed;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[TranslateStage] ❌ Ошибка при переводе чанка ${i + 1}: ${errorMessage}`);
          console.error(`   Чанк ID: ${chunk.id}, Индекс: ${chunk.index}`);
          
          // Add empty translation to maintain chunk order, but mark as failed
          chunkResults.push({
            chunkId: chunk.id,
            original: chunk.content,
            translated: `[ERROR: ${errorMessage}]`,
          });
          
          // Continue with next chunk instead of failing completely
        }
      }

      console.log(`[TranslateStage] Всего переведено ${chunkResults.length} чанков, токенов использовано: ${totalTokens}`);

      // Merge translated chunks
      // Extract index from chunkId (format: "chunk_0", "chunk_1", etc.)
      const chunksToMerge = chunkResults.map((c) => {
        const indexMatch = c.chunkId.match(/chunk_(\d+)/);
        const index = indexMatch ? parseInt(indexMatch[1], 10) : -1;
        
        if (index === -1) {
          console.error(`[TranslateStage] ❌ Не удалось извлечь индекс из chunkId: ${c.chunkId}`);
        }
        
        return {
          content: c.translated,
          index: index,
        };
      });

      // Filter out invalid chunks and log
      const validChunks = chunksToMerge.filter(c => c.index >= 0);
      if (validChunks.length !== chunkResults.length) {
        console.error(`[TranslateStage] ❌ Потеряно ${chunkResults.length - validChunks.length} чанков при извлечении индексов!`);
      }

      console.log(`[TranslateStage] Объединение ${validChunks.length} чанков...`);
      const translatedText = mergeChunks(validChunks);
      
      console.log(`[TranslateStage] ✅ Финальный перевод: ${translatedText.length} символов`);
      
      if (translatedText.length === 0) {
        console.error(`[TranslateStage] ❌ КРИТИЧЕСКАЯ ОШИБКА: Финальный перевод пуст после объединения ${validChunks.length} чанков!`);
      }

      // Final validation
      if (!translatedText || translatedText.trim().length === 0) {
        console.error(`[TranslateStage] ❌ КРИТИЧЕСКАЯ ОШИБКА: Финальный перевод пуст!`);
        console.error(`   Количество чанков: ${chunks.length}`);
        console.error(`   Переведено чанков: ${chunkResults.length}`);
        console.error(`   Валидных чанков для объединения: ${validChunks.length}`);
        
        return {
          stage: 'translate',
          success: false,
          error: 'Translation resulted in empty text after merging chunks',
          tokensUsed: totalTokens,
          duration: Date.now() - startTime,
        };
      }

      // Verify chunk count matches
      if (chunkResults.length !== chunks.length) {
        console.error(`[TranslateStage] ❌ Несоответствие: переведено ${chunkResults.length} из ${chunks.length} чанков!`);
      }

      console.log(`[TranslateStage] ✅ Перевод завершен успешно: ${translatedText.length} символов из ${sourceText.length} оригинальных`);

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
      return {
        stage: 'translate',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: totalTokens,
        duration: Date.now() - startTime,
      };
    }
  }

  private async translateChunk(
    chunk: TextChunk,
    glossaryText: string,
    contextText: string,
    styleGuide: string
  ): Promise<{ translation: ChunkTranslation; tokensUsed: number }> {
    // Validate provider before use
    if (!this.provider) {
      throw new Error('Translation provider is not initialized');
    }

    // Try JSON format first (preferred), fallback to text if provider doesn't support it
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

    // Try JSON format first
    if (supportsJSON) {
      try {
        const response = await this.provider.completeJSON<{
          paragraphs: Array<{ id: string; translated: string }>;
        }>(messages, {
          temperature: 0.7,
          maxTokens: 4096,
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
            console.log(`[TranslateStage] ✅ Чанк ${chunk.id} переведен через JSON (${translatedText.length} символов)`);
          }
        } else {
          throw new Error('Invalid JSON structure: missing paragraphs array');
        }
      } catch (jsonError) {
        console.warn(`[TranslateStage] ⚠️ JSON перевод не удался для чанка ${chunk.id}, используем текстовый формат`);
        console.warn(`   Ошибка: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
        
        // Fallback to text format
        if (typeof this.provider.complete === 'function') {
          const response = await this.provider.complete(messages, {
            temperature: 0.7,
            maxTokens: 4096,
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
        temperature: 0.7,
        maxTokens: 4096,
      });
      translatedText = response.content ? response.content.trim() : '';
      tokensUsed = response.tokensUsed?.total || 0;
    }
    
    if (!translatedText || translatedText.length === 0) {
      console.error(`[TranslateStage] ❌ Чанк ${chunk.id} вернул пустой ответ от провайдера!`);
      console.error(`   Оригинальный текст чанка: ${chunk.content.substring(0, 100)}...`);
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
