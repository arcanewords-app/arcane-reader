/**
 * OpenAI LLM Provider implementation
 */

import OpenAI from 'openai';
import type {
  ILLMProvider,
  LLMProviderConfig,
  Message,
  CompletionOptions,
  CompletionResult,
} from '../interfaces/llm-provider.js';
import { log } from '../logger.js';
import { estimateTokensHeuristic } from '../utils/token-estimate.js';
import { captureLlmCall } from '../../debug/promptCapture.js';
import { buildChatCompletionParams } from '../../shared/openaiModelAdapter.js';

const STRUCTURED_JSON_RETRY_MAX_TOKENS = 16384;

function isRateLimitError(err: unknown): boolean {
  return (
    err instanceof Error &&
    'status' in err &&
    typeof (err as { status?: number }).status === 'number' &&
    (err as { status: number }).status === 429
  );
}

function logIfRateLimit(err: unknown, context: string): void {
  if (isRateLimitError(err)) {
    log.warn('OpenAI rate limit (429) - consider lowering BULL_*_CONCURRENCY or PARALLEL_CHUNKS', {
      err,
      context,
      status: (err as { status: number }).status,
    });
  }
}

function describeCompletionChoice(
  response: OpenAI.Chat.Completions.ChatCompletion,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const choice = response.choices[0];
  const message = choice?.message;
  const usage = response.usage;
  const completionDetails = usage?.completion_tokens_details as
    | { reasoning_tokens?: number }
    | undefined;

  return {
    model: response.model,
    finishReason: choice?.finish_reason ?? null,
    contentLength: message?.content?.length ?? 0,
    refusal: message?.refusal ?? null,
    promptTokens: usage?.prompt_tokens ?? null,
    completionTokens: usage?.completion_tokens ?? null,
    reasoningTokens: completionDetails?.reasoning_tokens ?? null,
    ...extra,
  };
}

function isEmptyContent(content: string | null | undefined): boolean {
  return !content || content.trim().length === 0;
}

function shouldRetryJsonCompletion(
  content: string | null | undefined,
  finishReason: string | null | undefined
): boolean {
  return isEmptyContent(content) || finishReason === 'length';
}

function formatJsonParseError(
  content: string,
  finishReason: string | null | undefined,
  maxTokens?: number
): Error {
  if (finishReason === 'length') {
    return new Error(
      `Response truncated at max_tokens${maxTokens != null ? ` (${maxTokens})` : ''}`
    );
  }
  const preview = content.length > 200 ? `${content.slice(0, 200)}...` : content;
  return new Error(`Failed to parse JSON response (preview: ${preview})`);
}

function buildJsonRetryAttempts(
  options?: CompletionOptions
): Array<{ options: CompletionOptions | undefined; attempt: number }> {
  const firstMax = options?.maxTokens ?? 4096;
  return [
    { options, attempt: 1 },
    {
      attempt: 2,
      options: {
        ...options,
        maxTokens: Math.min(firstMax * 2, STRUCTURED_JSON_RETRY_MAX_TOKENS),
        reasoningEffort: 'low',
      },
    },
  ];
}

function captureParamsFromResponse(
  response: OpenAI.Chat.Completions.ChatCompletion,
  base: {
    method: 'complete' | 'completeJSON' | 'completeStructuredJSON';
    messages: Message[];
    responseContent: string;
    tokens: { prompt: number; completion: number; total: number };
    schemaName?: string;
    attempt?: number;
  }
): Parameters<typeof captureLlmCall>[0] {
  const meta = describeCompletionChoice(response, {
    method: base.method,
    schemaName: base.schemaName,
    attempt: base.attempt,
  });
  return {
    model: response.model,
    method: base.method,
    messages: base.messages.map((m) => ({ role: m.role, content: m.content })),
    responseContent: base.responseContent,
    tokens: base.tokens,
    finishReason: (meta.finishReason as string | null) ?? null,
    reasoningTokens: (meta.reasoningTokens as number | null) ?? null,
    contentLength: meta.contentLength as number,
    attempt: base.attempt,
    schemaName: base.schemaName,
  };
}

export class OpenAIProvider implements ILLMProvider {
  readonly name = 'openai';
  readonly model: string;

  private client: OpenAI;
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.model = config.model ?? 'gpt-4.1-mini';

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 600000, // 10 min default (2000-token chunks, analysis of long chapters)
      maxRetries: config.maxRetries ?? 3,
    });
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    try {
      const response = await this.client.chat.completions.create(
        buildChatCompletionParams({
          model: this.model,
          messages,
          options,
          defaultTemperature: 0.7,
          responseFormat: 'text',
        }) as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
      );

      const choice = response.choices[0];
      const content = choice.message.content ?? '';

      if (isEmptyContent(content)) {
        log.warn(
          'OpenAI provider: empty text completion',
          describeCompletionChoice(response, {
            method: 'complete',
          })
        );
      }

      captureLlmCall(
        captureParamsFromResponse(response, {
          method: 'complete',
          messages,
          responseContent: content,
          tokens: {
            prompt: response.usage?.prompt_tokens ?? 0,
            completion: response.usage?.completion_tokens ?? 0,
            total: response.usage?.total_tokens ?? 0,
          },
        })
      );

      return {
        content,
        tokensUsed: {
          prompt: response.usage?.prompt_tokens ?? 0,
          completion: response.usage?.completion_tokens ?? 0,
          total: response.usage?.total_tokens ?? 0,
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
        model: response.model,
      };
    } catch (err) {
      logIfRateLimit(err, 'complete');
      throw err;
    }
  }

  async completeJSON<T>(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<{ data: T; tokensUsed: CompletionResult['tokensUsed'] }> {
    const attempts = buildJsonRetryAttempts(options);
    let lastError: Error | undefined;

    for (const { options: attemptOptions, attempt } of attempts) {
      try {
        const response = await this.client.chat.completions.create(
          buildChatCompletionParams({
            model: this.model,
            messages,
            options: attemptOptions,
            defaultTemperature: 0.3,
            responseFormat: 'json_object',
          }) as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
        );

        const choice = response.choices[0];
        const content = choice.message.content ?? '';
        const finishReason = choice.finish_reason;
        const maxTokens = attemptOptions?.maxTokens ?? options?.maxTokens;

        if (shouldRetryJsonCompletion(content, finishReason)) {
          log.warn('OpenAI provider: JSON empty or truncated, will retry if attempts remain', {
            ...describeCompletionChoice(response, {
              method: 'completeJSON',
              attempt,
            }),
          });
          if (attempt < attempts.length) continue;
          throw new Error(
            finishReason === 'length'
              ? `Response truncated at max_tokens${maxTokens != null ? ` (${maxTokens})` : ''}`
              : 'Empty JSON response from provider'
          );
        }

        try {
          const data = JSON.parse(content) as T;
          captureLlmCall(
            captureParamsFromResponse(response, {
              method: 'completeJSON',
              messages,
              responseContent: content,
              tokens: {
                prompt: response.usage?.prompt_tokens ?? 0,
                completion: response.usage?.completion_tokens ?? 0,
                total: response.usage?.total_tokens ?? 0,
              },
              attempt,
            })
          );
          return {
            data,
            tokensUsed: {
              prompt: response.usage?.prompt_tokens ?? 0,
              completion: response.usage?.completion_tokens ?? 0,
              total: response.usage?.total_tokens ?? 0,
            },
          };
        } catch (parseErr) {
          const preview = content.length > 200 ? `${content.slice(0, 200)}...` : content;
          log.error('OpenAI provider: failed to parse JSON response', {
            err: parseErr,
            contentPreview: preview,
            ...describeCompletionChoice(response, { method: 'completeJSON', attempt }),
          });
          lastError = formatJsonParseError(content, finishReason, maxTokens);
          if (attempt < attempts.length) continue;
          throw lastError;
        }
      } catch (err) {
        logIfRateLimit(err, 'completeJSON');
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < attempts.length) {
          log.info('OpenAI provider: JSON attempt failed, retrying', {
            attempt,
            errMessage: lastError.message,
          });
          continue;
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error('JSON completion failed');
  }

  async completeStructuredJSON<T>(
    messages: Message[],
    schema: Record<string, unknown>,
    schemaName: string,
    options?: CompletionOptions
  ): Promise<{ data: T; tokensUsed: CompletionResult['tokensUsed'] }> {
    const attempts = buildJsonRetryAttempts(options);

    let lastError: Error | undefined;

    for (const { options: attemptOptions, attempt } of attempts) {
      try {
        const response = await this.client.chat.completions.create(
          buildChatCompletionParams({
            model: this.model,
            messages,
            options: attemptOptions,
            defaultTemperature: 0.3,
            responseFormat: {
              type: 'json_schema',
              json_schema: {
                name: schemaName,
                strict: true,
                schema,
              },
            },
          }) as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
        );

        const choice = response.choices[0];
        const content = choice.message.content ?? '';
        const finishReason = choice.finish_reason;

        if (shouldRetryJsonCompletion(content, finishReason)) {
          log.warn(
            'OpenAI provider: structured JSON empty or truncated, will retry if attempts remain',
            {
              ...describeCompletionChoice(response, {
                method: 'completeStructuredJSON',
                schemaName,
                attempt,
              }),
            }
          );
          if (attempt < attempts.length) continue;
          throw new Error(
            `Empty structured JSON response (finish_reason=${finishReason ?? 'unknown'})`
          );
        }

        try {
          const data = JSON.parse(content) as T;
          captureLlmCall(
            captureParamsFromResponse(response, {
              method: 'completeStructuredJSON',
              messages,
              responseContent: content,
              tokens: {
                prompt: response.usage?.prompt_tokens ?? 0,
                completion: response.usage?.completion_tokens ?? 0,
                total: response.usage?.total_tokens ?? 0,
              },
              schemaName,
              attempt,
            })
          );
          return {
            data,
            tokensUsed: {
              prompt: response.usage?.prompt_tokens ?? 0,
              completion: response.usage?.completion_tokens ?? 0,
              total: response.usage?.total_tokens ?? 0,
            },
          };
        } catch (parseErr) {
          const preview = content.length > 200 ? content.slice(0, 200) + '...' : content;
          log.error('OpenAI provider: failed to parse structured JSON response', {
            err: parseErr,
            contentPreview: preview,
            ...describeCompletionChoice(response, {
              method: 'completeStructuredJSON',
              schemaName,
              attempt,
            }),
          });
          lastError = formatJsonParseError(content, finishReason, attemptOptions?.maxTokens);
          if (attempt < attempts.length) continue;
          throw lastError;
        }
      } catch (err) {
        logIfRateLimit(err, 'completeStructuredJSON');
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < attempts.length) {
          log.info('OpenAI provider: structured JSON attempt failed, retrying', {
            schemaName,
            attempt,
            errMessage: lastError.message,
          });
          continue;
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error('Structured JSON completion failed');
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (err) {
      log.warn('OpenAI provider: isAvailable check failed', err instanceof Error ? err : undefined);
      return false;
    }
  }

  estimateTokens(text: string): number {
    return estimateTokensHeuristic(text);
  }

  private mapFinishReason(reason: string | null): CompletionResult['finishReason'] {
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
