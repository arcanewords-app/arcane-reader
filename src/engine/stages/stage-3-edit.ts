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
import { EDITOR_SYSTEM_PROMPT, createEditorPrompt, QUALITY_CHECK_PROMPT } from '../prompts/system/editor.js';
import { GlossaryManager } from '../glossary/glossary-manager.js';
import { chunkText, mergeChunks } from '../utils/chunker.js';

interface EditStageOptions {
  context: AgentContext;
  checkQuality?: boolean;
  chunkSize?: number; // Max tokens per chunk for chunked editing
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
      throw new Error(`EditStage: provider is missing complete method. Provider: ${JSON.stringify(provider)}`);
    }
    this.provider = provider;
    console.log(`[EditStage] Initialized with provider: ${!!this.provider}, has complete: ${typeof this.provider.complete}`);
  }
  
  async execute(
    translatedText: string,
    originalText: string,
    options: EditStageOptions
  ): Promise<StageResult<EditedTranslation>> {
    const startTime = Date.now();
    let totalTokens = 0;
    
    // Validate provider
    if (!this.provider) {
      return {
        stage: 'edit',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: 'Editing provider is not initialized',
      };
    }
    
    if (typeof this.provider.complete !== 'function') {
      return {
        stage: 'edit',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: `Editing provider is missing complete method. Provider type: ${typeof this.provider}, has complete: ${!!this.provider.complete}`,
      };
    }
    
    try {
      // Prepare glossary
      const glossaryManager = new GlossaryManager(options.context.glossary);
      const glossaryText = glossaryManager.toPromptText();
      
      // Prepare style notes
      const styleNotes = this.buildStyleNotes(options.context);
      
      // Determine if we should use chunked editing
      // Use chunked editing if chunkSize is specified OR if text is too large
      const estimatedTokens = Math.ceil(translatedText.length / 4);
      const useChunkedEditing = options.chunkSize !== undefined || estimatedTokens > 3000;
      
      let editedText: string;
      
      if (useChunkedEditing) {
        // Chunked editing for large texts
        const chunkSize = options.chunkSize ?? 2000;
        console.log(`[EditStage] Используется чанковое редактирование (размер текста: ~${estimatedTokens} токенов, размер чанка: ${chunkSize})`);
        
        const chunkedResult = await this.editChunked(
          translatedText,
          originalText,
          glossaryText,
          styleNotes,
          chunkSize
        );
        
        editedText = chunkedResult.text;
        totalTokens = chunkedResult.tokensUsed;
      } else {
        // Single-request editing for small texts
        console.log(`[EditStage] Используется прямое редактирование (размер текста: ~${estimatedTokens} токенов)`);
        
        const messages: Message[] = [
          { role: 'system', content: EDITOR_SYSTEM_PROMPT },
          {
            role: 'user',
            content: createEditorPrompt(
              translatedText,
              originalText,
              glossaryText,
              styleNotes
            ),
          },
        ];
        
        const editResponse = await this.provider.complete(messages, {
          temperature: 0.5,
          maxTokens: 4096,
        });
        
        totalTokens += editResponse.tokensUsed.total;
        editedText = editResponse.content.trim();
      }
      
      // Detect changes
      const changes = this.detectChanges(translatedText, editedText);
      
      // Optional quality check (only for small texts to avoid timeout)
      let qualityScore: number | undefined;
      
      if (options.checkQuality && !useChunkedEditing) {
        // Skip quality check for chunked editing to avoid timeout
        try {
          const qualityResult = await this.checkQuality(
            editedText,
            originalText,
            glossaryText
          );
          totalTokens += qualityResult.tokensUsed;
          qualityScore = qualityResult.score;
        } catch (qualityError) {
          console.warn(`[EditStage] Quality check failed: ${qualityError instanceof Error ? qualityError.message : 'Unknown error'}`);
        }
      } else if (options.checkQuality && useChunkedEditing) {
        console.log(`[EditStage] Quality check пропущен для чанкового редактирования (избежание таймаутов)`);
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
      return {
        stage: 'edit',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
   * Edit translation using chunked approach
   * Preserves paragraph markers for later synchronization
   */
  private async editChunked(
    translatedText: string,
    originalText: string,
    glossaryText: string,
    styleNotes: string,
    chunkSize: number
  ): Promise<{ text: string; tokensUsed: number }> {
    // Chunk both translated and original texts
    const translatedChunks = chunkText(translatedText, {
      maxTokens: chunkSize,
      preserveParagraphs: true,
    });
    
    const originalChunks = chunkText(originalText, {
      maxTokens: chunkSize,
      preserveParagraphs: true,
    });
    
    console.log(`[EditStage] Разбито на ${translatedChunks.length} чанков для редактирования`);
    
    // Edit each chunk
    const editedChunks: { content: string; index: number }[] = [];
    let totalTokensUsed = 0;
    
    for (let i = 0; i < translatedChunks.length; i++) {
      const translatedChunk = translatedChunks[i];
      const originalChunk = originalChunks[i] || { content: '', index: i };
      
      console.log(`[EditStage] Редактирование чанка ${i + 1}/${translatedChunks.length} (ID: ${translatedChunk.id}, токенов: ${translatedChunk.tokenCount})`);
      
      try {
        const editResult = await this.editChunk(
          translatedChunk,
          originalChunk,
          glossaryText,
          styleNotes
        );
        
        totalTokensUsed += editResult.tokensUsed;
        
        if (!editResult.text || editResult.text.trim().length === 0) {
          console.warn(`[EditStage] ⚠️ Чанк ${i + 1} вернул пустое редактирование!`);
          // Use original translated chunk if editing failed
          editedChunks.push({
            content: translatedChunk.content,
            index: translatedChunk.index,
          });
        } else {
          console.log(`[EditStage] ✅ Чанк ${i + 1} отредактирован (${editResult.text.length} символов, ${editResult.tokensUsed} токенов)`);
          editedChunks.push({
            content: editResult.text,
            index: translatedChunk.index,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[EditStage] ❌ Ошибка при редактировании чанка ${i + 1}: ${errorMessage}`);
        
        // Use original translated chunk if editing failed
        editedChunks.push({
          content: translatedChunk.content,
          index: translatedChunk.index,
        });
        
        // Continue with next chunk instead of failing completely
      }
    }
    
    console.log(`[EditStage] Всего отредактировано ${editedChunks.length} чанков, использовано токенов: ${totalTokensUsed}`);
    
    // Merge edited chunks back together
    const finalText = mergeChunks(editedChunks);
    
    if (!finalText || finalText.trim().length === 0) {
      console.error(`[EditStage] ❌ КРИТИЧЕСКАЯ ОШИБКА: Финальный отредактированный текст пуст после объединения ${editedChunks.length} чанков!`);
      // Fallback to original translation
      return { text: translatedText, tokensUsed: totalTokensUsed };
    }
    
    console.log(`[EditStage] ✅ Финальный отредактированный текст: ${finalText.length} символов`);
    
    return { text: finalText, tokensUsed: totalTokensUsed };
  }
  
  /**
   * Edit a single chunk of translated text
   */
  private async editChunk(
    translatedChunk: TextChunk,
    originalChunk: TextChunk,
    glossaryText: string,
    styleNotes: string
  ): Promise<{ text: string; tokensUsed: number }> {
    const messages: Message[] = [
      { role: 'system', content: EDITOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: createEditorPrompt(
          translatedChunk.content,
          originalChunk.content,
          glossaryText,
          styleNotes
        ),
      },
    ];
    
    const editResponse = await this.provider.complete(messages, {
      temperature: 0.5,
      maxTokens: 4096,
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

