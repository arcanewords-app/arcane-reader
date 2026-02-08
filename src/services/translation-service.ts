/**
 * Translation Service - интеграция с arcane-engine
 *
 * Этот сервис связывает UI с движком перевода
 */

import type { AppConfig } from '../config.js';

// Типы для работы с переводом
export interface TranslationRequest {
  projectId: string;
  chapterId: string;
  originalText: string;
  glossary: GlossaryEntry[];
  chapterNumber: number;
}

export interface TranslationResult {
  success: boolean;
  translatedText?: string;
  error?: string;
  tokensUsed?: number;
  duration?: number;
  glossaryUpdates?: GlossaryEntry[];
}

export interface GlossaryEntry {
  id: string;
  type: 'character' | 'location' | 'term';
  original: string;
  translated: string;
  notes?: string;
}

/**
 * Translation Service
 * Manages translation pipeline and AI provider connections
 */
export class TranslationService {
  private config: AppConfig;
  private isInitialized = false;

  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Initialize the service and validate API keys
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    // Check for API key
    if (!this.config.openai.apiKey) {
      return {
        success: false,
        error: 'OpenAI API ключ не настроен. Добавьте OPENAI_API_KEY в .env файл.',
      };
    }

    // TODO: Test API connection
    // const provider = new OpenAIProvider({ apiKey: this.config.openai.apiKey });
    // const available = await provider.isAvailable();

    this.isInitialized = true;
    return { success: true };
  }

  /**
   * Translate a chapter
   */
  async translateChapter(request: TranslationRequest): Promise<TranslationResult> {
    if (!this.isInitialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return { success: false, error: initResult.error };
      }
    }

    const startTime = Date.now();

    try {
      // TODO: Полная интеграция с arcane-engine
      //
      // import { TranslationPipeline, OpenAIProvider, NovelAgent } from 'arcane-engine';
      //
      // const provider = new OpenAIProvider({
      //   apiKey: this.config.openai.apiKey,
      //   model: this.config.openai.model,
      // });
      //
      // const agent = await this.loadOrCreateAgent(request.projectId);
      // const pipeline = new TranslationPipeline({ provider, agent });
      //
      // const result = await pipeline.translateChapter(
      //   request.originalText,
      //   request.chapterNumber,
      //   { skipEditing: this.config.translation.skipEditing }
      // );
      //
      // await this.saveAgent(request.projectId, agent);
      //
      // return {
      //   success: true,
      //   translatedText: result.finalTranslation,
      //   tokensUsed: result.totalTokensUsed,
      //   duration: result.totalDuration,
      //   glossaryUpdates: this.extractGlossaryUpdates(result),
      // };

      // Временная заглушка - симуляция перевода
      await this.simulateDelay(2000);

      return {
        success: true,
        translatedText: this.createDemoTranslation(request),
        tokensUsed: 0,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка перевода',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return Boolean(this.config.openai.apiKey);
  }

  /**
   * Get service status
   */
  getStatus(): {
    ready: boolean;
    provider: string | null;
    model: string | null;
  } {
    if (this.config.openai.apiKey) {
      return {
        ready: true,
        provider: 'OpenAI',
        model: this.config.openai.model,
      };
    }

    if (this.config.anthropic.apiKey) {
      return {
        ready: true,
        provider: 'Anthropic',
        model: 'claude-3-opus',
      };
    }

    return {
      ready: false,
      provider: null,
      model: null,
    };
  }

  // ============ Helper methods ============

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createDemoTranslation(request: TranslationRequest): string {
    const lines = request.originalText.split('\n');

    let result = `═══════════════════════════════════════════\n`;
    result += `  ДЕМО ПЕРЕВОД — Глава ${request.chapterNumber}\n`;
    result += `═══════════════════════════════════════════\n\n`;
    result += `⚠️ Это демонстрационный режим.\n`;
    result += `Для реального перевода добавьте OPENAI_API_KEY в файл .env\n\n`;
    result += `───────────────────────────────────────────\n\n`;

    // Показываем оригинальный текст с пометкой
    for (const line of lines) {
      if (line.trim()) {
        result += `📖 ${line}\n`;
      } else {
        result += '\n';
      }
    }

    result += `\n───────────────────────────────────────────\n`;
    result += `Глоссарий: ${request.glossary.length} записей\n`;

    return result;
  }
}

/**
 * Create and export singleton instance
 */
let serviceInstance: TranslationService | null = null;

export function getTranslationService(config: AppConfig): TranslationService {
  if (!serviceInstance) {
    serviceInstance = new TranslationService(config);
  }
  return serviceInstance;
}
