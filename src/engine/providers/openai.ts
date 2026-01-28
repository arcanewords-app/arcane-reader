/**
 * OpenAI LLM Provider implementation
 */

import OpenAI from 'openai';
import type { 
  ILLMProvider, 
  LLMProviderConfig, 
  Message, 
  CompletionOptions, 
  CompletionResult 
} from '../interfaces/llm-provider.js';

export class OpenAIProvider implements ILLMProvider {
  readonly name = 'openai';
  readonly model: string;
  
  private client: OpenAI;
  private config: LLMProviderConfig;
  
  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.model = config.model ?? 'gpt-4-turbo-preview';
    
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 60000,
      maxRetries: config.maxRetries ?? 3,
    });
  }
  
  async complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      top_p: options?.topP,
      frequency_penalty: options?.frequencyPenalty,
      presence_penalty: options?.presencePenalty,
      stop: options?.stop,
    });
    
    const choice = response.choices[0];
    
    return {
      content: choice.message.content ?? '',
      tokensUsed: {
        prompt: response.usage?.prompt_tokens ?? 0,
        completion: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      finishReason: this.mapFinishReason(choice.finish_reason),
      model: response.model,
    };
  }
  
  async completeJSON<T>(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<{ data: T; tokensUsed: CompletionResult['tokensUsed'] }> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.3, // Lower temp for structured output
      max_tokens: options?.maxTokens ?? 4096,
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0].message.content ?? '{}';
    
    try {
      const data = JSON.parse(content) as T;
      return {
        data,
        tokensUsed: {
          prompt: response.usage?.prompt_tokens ?? 0,
          completion: response.usage?.completion_tokens ?? 0,
          total: response.usage?.total_tokens ?? 0,
        },
      };
    } catch {
      throw new Error(`Failed to parse JSON response: ${content}`);
    }
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
  
  estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English
    // For CJK languages, roughly 1-2 characters per token
    const cjkPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g;
    const cjkMatches = text.match(cjkPattern) ?? [];
    const nonCjkLength = text.length - cjkMatches.length;
    
    return Math.ceil(nonCjkLength / 4) + cjkMatches.length;
  }
  
  private mapFinishReason(
    reason: string | null
  ): CompletionResult['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'error';
    }
  }
}

