/**
 * OpenAI Chat Completions model capabilities (no SDK import — safe for the client bundle).
 */

export type ReasoningEffort = 'low' | 'medium' | 'high';

export type ModelFamily = 'legacy' | 'gpt-4o' | 'gpt-4.1' | 'gpt-5' | 'o-series';

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

export interface TranslateLlmDefaults {
  maxTokens: number;
  defaultReasoningEffort?: ReasoningEffort;
  preferJsonObjectOverStructuredSchema: boolean;
}

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
