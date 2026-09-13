/**
 * Single source of truth for OpenAI Chat Completions request params.
 * Capabilities live in openaiModelCapabilities.ts so the client model list
 * does not import the OpenAI SDK (oxlint type-aware / client tsconfig).
 */

import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import {
  resolveModelCapabilities,
  type ReasoningEffort,
} from './openaiModelCapabilities.js';

export type {
  ModelCapabilities,
  ModelFamily,
  ReasoningEffort,
  TranslateLlmDefaults,
} from './openaiModelCapabilities.js';
export {
  isReasoningModel,
  modelUsesDefaultTemperature,
  resolveModelCapabilities,
  resolveTranslateLlmDefaults,
} from './openaiModelCapabilities.js';

export interface AdapterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AdapterCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  reasoningEffort?: ReasoningEffort;
}

export type ChatResponseFormat =
  | 'text'
  | 'json_object'
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        strict: boolean;
        schema: Record<string, unknown>;
      };
    };

export interface BuildChatCompletionParamsInput {
  model: string;
  messages: AdapterMessage[];
  options?: AdapterCompletionOptions;
  responseFormat?: ChatResponseFormat;
  defaultTemperature: number;
}

function toChatMessageParam(message: AdapterMessage): ChatCompletionMessageParam {
  switch (message.role) {
    case 'system':
      return { role: 'system', content: message.content };
    case 'user':
      return { role: 'user', content: message.content };
    case 'assistant':
      return { role: 'assistant', content: message.content };
  }
}

export function buildChatCompletionParams(
  input: BuildChatCompletionParamsInput
): ChatCompletionCreateParamsNonStreaming {
  const caps = resolveModelCapabilities(input.model);
  const options = input.options ?? {};
  const maxTokens = options.maxTokens ?? 4096;

  const params: ChatCompletionCreateParamsNonStreaming = {
    model: input.model,
    messages: input.messages.map(toChatMessageParam),
  };

  if (caps.supportsCustomTemperature) {
    params.temperature = options.temperature ?? input.defaultTemperature;
  }

  if (caps.tokenLimitParam === 'max_completion_tokens') {
    params.max_completion_tokens = maxTokens;
  } else {
    params.max_tokens = maxTokens;
  }

  if (options.topP != null) params.top_p = options.topP;
  if (options.frequencyPenalty != null) params.frequency_penalty = options.frequencyPenalty;
  if (options.presencePenalty != null) params.presence_penalty = options.presencePenalty;
  if (options.stop != null) params.stop = options.stop;

  if (caps.supportsReasoningEffort && options.reasoningEffort) {
    params.reasoning_effort = options.reasoningEffort;
  }

  if (input.responseFormat && input.responseFormat !== 'text') {
    if (input.responseFormat === 'json_object') {
      params.response_format = { type: 'json_object' };
    } else {
      params.response_format = {
        type: 'json_schema',
        json_schema: {
          name: input.responseFormat.json_schema.name,
          strict: input.responseFormat.json_schema.strict,
          schema: input.responseFormat.json_schema.schema,
        },
      };
    }
  }

  return params;
}

/** Human-readable snapshot of params actually sent (for Prompt Lab debug). */
export function describeSanitizedRequestParams(
  input: BuildChatCompletionParamsInput
): Record<string, unknown> {
  const built = buildChatCompletionParams(input);
  const caps = resolveModelCapabilities(input.model);
  const snapshot: Record<string, unknown> = {
    model: built.model,
    tokenLimitParam: caps.tokenLimitParam,
    tokenLimit:
      caps.tokenLimitParam === 'max_completion_tokens'
        ? built.max_completion_tokens
        : built.max_tokens,
    temperature: caps.supportsCustomTemperature ? built.temperature : 'omitted (model default)',
    reasoning_effort: built.reasoning_effort ?? 'omitted (API default)',
    response_format: built.response_format?.type ?? 'text',
  };
  return snapshot;
}
