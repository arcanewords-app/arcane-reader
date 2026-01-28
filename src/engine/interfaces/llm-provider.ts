/**
 * LLM Provider interface - abstraction for different AI providers
 */

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

export interface CompletionResult {
  content: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  model: string;
}

export interface ILLMProvider {
  readonly name: string;
  readonly model: string;
  
  /**
   * Send a completion request to the LLM
   */
  complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResult>;
  
  /**
   * Send a completion request with JSON response
   */
  completeJSON<T>(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<{ data: T; tokensUsed: CompletionResult['tokensUsed'] }>;
  
  /**
   * Check if the provider is available and configured
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get approximate token count for text
   */
  estimateTokens(text: string): number;
}

export interface LLMProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

