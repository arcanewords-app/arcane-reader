/**
 * Single source of truth for OpenAI Chat Completions model capabilities and request params.
 */

export type ReasoningEffort = 'low' | 'medium' | 'high';

export type ModelFamily = 'legacy' | 'gpt-4o' | 'gpt-4.1' | 'gpt-5' | 'o-series';

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

export interface ModelCapabilities {
  modelId: string;
  family: ModelFamily;
  apiSurface: 'chat_completions';
  supportsCustomTemperature: boolean;
  tokenLimitParam: 'max_tokens' | 'max_completion_tokens';
  isReasoningModel: boolean;
  isMiniModel: boolean;
  supportsReasoningEffort: boolean;
  supportsStructuredOutput: boolean;
  promoFreeTier: boolean;
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

/** Models eligible for OpenAI promo / free-tier daily token allowance (Chat Completions only). */
const PROMO_FREE_TIER_MODEL_IDS = new Set([
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o-mini',
  'o1-mini',
  'o3-mini',
  'o4-mini',
]);

function normalizedModelId(modelId: string): string {
  return (modelId || '').trim().toLowerCase();
}

function isPromoFreeTierModel(modelId: string): boolean {
  const m = normalizedModelId(modelId);
  if (PROMO_FREE_TIER_MODEL_IDS.has(m)) return true;
  // Snapshot ids: gpt-5.4-mini-2026-03-17, etc.
  for (const id of PROMO_FREE_TIER_MODEL_IDS) {
    if (m.startsWith(`${id}-`)) return true;
  }
  return false;
}

function isMiniModelName(m: string): boolean {
  return m.includes('mini') || m.includes('nano') || m === 'gpt-4o-mini';
}

function classifyFamily(m: string): ModelFamily {
  if (m.startsWith('gpt-5')) return 'gpt-5';
  if (m.startsWith('o1-') || m.startsWith('o3-') || m.startsWith('o4-')) return 'o-series';
  if (m.startsWith('gpt-4o')) return 'gpt-4o';
  if (m.includes('gpt-4.1') || m.includes('gpt-4.2')) return 'gpt-4.1';
  return 'legacy';
}

function usesMaxCompletionTokens(m: string, family: ModelFamily): boolean {
  if (family !== 'legacy') return true;
  return (
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.startsWith('gpt-4o') ||
    m.includes('gpt-4.1') ||
    m.includes('gpt-4.2') ||
    m.startsWith('gpt-5') ||
    m.includes('codex')
  );
}

function modelSupportsCustomTemperature(family: ModelFamily): boolean {
  return family !== 'gpt-5' && family !== 'o-series';
}

function isReasoningFamily(family: ModelFamily): boolean {
  return family === 'gpt-5' || family === 'o-series';
}

export function resolveModelCapabilities(modelId: string): ModelCapabilities {
  const m = normalizedModelId(modelId);
  const family = classifyFamily(m);
  const tokenLimitParam = usesMaxCompletionTokens(m, family)
    ? 'max_completion_tokens'
    : 'max_tokens';
  const supportsCustomTemperature = modelSupportsCustomTemperature(family);
  const isReasoningModel = isReasoningFamily(family);

  return {
    modelId: modelId.trim() || 'gpt-4.1-mini',
    family,
    apiSurface: 'chat_completions',
    supportsCustomTemperature,
    tokenLimitParam,
    isReasoningModel,
    isMiniModel: isMiniModelName(m),
    supportsReasoningEffort: isReasoningModel,
    supportsStructuredOutput: family !== 'legacy',
    promoFreeTier: isPromoFreeTierModel(modelId),
  };
}

export function modelUsesDefaultTemperature(modelId: string): boolean {
  return !resolveModelCapabilities(modelId).supportsCustomTemperature;
}

export function isReasoningModel(modelId: string): boolean {
  return resolveModelCapabilities(modelId).isReasoningModel;
}

export interface TranslateLlmDefaults {
  maxTokens: number;
  defaultReasoningEffort?: ReasoningEffort;
  preferJsonObjectOverStructuredSchema: boolean;
}

/** Model-aware translate completion defaults (token budget, reasoning effort). */
export function resolveTranslateLlmDefaults(
  modelId: string,
  structuredCoT: boolean
): TranslateLlmDefaults {
  const caps = resolveModelCapabilities(modelId);
  if (caps.isReasoningModel) {
    return {
      maxTokens: structuredCoT ? 16384 : 12288,
      defaultReasoningEffort: 'low',
      preferJsonObjectOverStructuredSchema: true,
    };
  }
  return {
    maxTokens: 8192,
    preferJsonObjectOverStructuredSchema: false,
  };
}

export interface BuildChatCompletionParamsInput {
  model: string;
  messages: AdapterMessage[];
  options?: AdapterCompletionOptions;
  responseFormat?: ChatResponseFormat;
  defaultTemperature: number;
}

export function buildChatCompletionParams(
  input: BuildChatCompletionParamsInput
): Record<string, unknown> {
  const caps = resolveModelCapabilities(input.model);
  const options = input.options ?? {};
  const maxTokens = options.maxTokens ?? 4096;

  const params: Record<string, unknown> = {
    model: input.model,
    messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
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
      params.response_format = input.responseFormat;
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
    response_format: (built.response_format as { type?: string } | undefined)?.type ?? 'text',
  };
  return snapshot;
}
