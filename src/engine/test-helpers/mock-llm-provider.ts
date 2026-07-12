/**
 * Shared mock ILLMProvider factory for engine stage tests.
 * Pattern mirrors openai.completejson.test.ts (call-index tracking, injectable handlers).
 */

import type { CompletionResult, ILLMProvider, Message } from '../interfaces/llm-provider.js';

export type MockCallIndex = number;

export function mockCompletionResult(
  content: string,
  finishReason: CompletionResult['finishReason'] = 'stop'
): CompletionResult {
  return {
    content,
    tokensUsed: { prompt: 10, completion: 20, total: 30 },
    finishReason,
    model: 'gpt-4.1-mini',
  };
}

export type MockJSONResult = {
  data: unknown;
  tokensUsed: CompletionResult['tokensUsed'];
};

export interface CreateMockProviderOptions {
  complete?: (
    messages: Message[],
    callIndex?: MockCallIndex
  ) => Promise<CompletionResult> | CompletionResult;
  completeJSON?: (
    messages: Message[],
    callIndex?: MockCallIndex
  ) => Promise<MockJSONResult> | MockJSONResult;
  completeStructuredJSON?: <T>(
    messages: Message[],
    schema: Record<string, unknown>,
    schemaName: string,
    callIndex?: MockCallIndex
  ) => Promise<{ data: T; tokensUsed: CompletionResult['tokensUsed'] }>;
  model?: string;
}

export type MockProvider = ILLMProvider & {
  getCallCounts: () => { complete: number; completeJSON: number; completeStructuredJSON: number };
};

/** Mock ILLMProvider with call-index tracking for retry / fallback tests. */
export function createMockProvider(options: CreateMockProviderOptions = {}): MockProvider {
  const counts = { complete: 0, completeJSON: 0, completeStructuredJSON: 0 };

  const provider: MockProvider = {
    name: 'mock',
    model: options.model ?? 'gpt-4.1-mini',
    getCallCounts: () => ({ ...counts }),

    complete: async (messages) => {
      const idx = counts.complete++;
      if (options.complete) return options.complete(messages, idx);
      return mockCompletionResult('mock response');
    },

    completeJSON: async <T>(messages: Message[]) => {
      const idx = counts.completeJSON++;
      if (options.completeJSON) {
        const result = await options.completeJSON(messages, idx);
        return { data: result.data as T, tokensUsed: result.tokensUsed };
      }
      return {
        data: {} as T,
        tokensUsed: { prompt: 1, completion: 1, total: 2 },
      };
    },

    isAvailable: async () => true,
    estimateTokens: (text) => Math.ceil(text.length / 4),
  };

  if (options.completeStructuredJSON) {
    provider.completeStructuredJSON = async (messages, schema, schemaName) => {
      const idx = counts.completeStructuredJSON++;
      return options.completeStructuredJSON!(messages, schema, schemaName, idx);
    };
  }

  return provider;
}
