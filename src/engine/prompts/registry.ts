import type { Language } from '../types/common.js';
import { assertSupportedPair, pairKey } from '../language.js';
import { analyzerPrompts as enRuAnalyzer } from './pairs/en-ru/analyzer.js';
import { translatorPrompts as enRuTranslator } from './pairs/en-ru/translator.js';
import { analyzerPrompts as koRuAnalyzer } from './pairs/ko-ru/analyzer.js';
import { translatorPrompts as koRuTranslator } from './pairs/ko-ru/translator.js';
import { analyzerPrompts as zhRuAnalyzer } from './pairs/zh-ru/analyzer.js';
import { translatorPrompts as zhRuTranslator } from './pairs/zh-ru/translator.js';
import { analyzerPrompts as enBeAnalyzer } from './pairs/en-be/analyzer.js';
import { translatorPrompts as enBeTranslator } from './pairs/en-be/translator.js';
import { analyzerPrompts as koBeAnalyzer } from './pairs/ko-be/analyzer.js';
import { translatorPrompts as koBeTranslator } from './pairs/ko-be/translator.js';
import { analyzerPrompts as zhBeAnalyzer } from './pairs/zh-be/analyzer.js';
import { translatorPrompts as zhBeTranslator } from './pairs/zh-be/translator.js';
import { analyzerPrompts as ruBeAnalyzer } from './pairs/ru-be/analyzer.js';
import { translatorPrompts as ruBeTranslator } from './pairs/ru-be/translator.js';
import type { AnalyzerPromptBundle, PromptStage, TranslatorPromptBundle } from './types.js';

type PairPrompts = {
  analyze: AnalyzerPromptBundle;
  translate: TranslatorPromptBundle;
};

const REGISTRY: Record<string, PairPrompts> = {
  'en-ru': { analyze: enRuAnalyzer, translate: enRuTranslator },
  'ko-ru': { analyze: koRuAnalyzer, translate: koRuTranslator },
  'zh-ru': { analyze: zhRuAnalyzer, translate: zhRuTranslator },
  'en-be': { analyze: enBeAnalyzer, translate: enBeTranslator },
  'ko-be': { analyze: koBeAnalyzer, translate: koBeTranslator },
  'zh-be': { analyze: zhBeAnalyzer, translate: zhBeTranslator },
  'ru-be': { analyze: ruBeAnalyzer, translate: ruBeTranslator },
};

export function resolvePrompts(
  stage: 'analyze',
  source: Language,
  target: Language
): AnalyzerPromptBundle;
export function resolvePrompts(
  stage: 'translate',
  source: Language,
  target: Language
): TranslatorPromptBundle;
export function resolvePrompts(
  stage: PromptStage,
  source: Language,
  target: Language
): AnalyzerPromptBundle | TranslatorPromptBundle {
  assertSupportedPair(source, target);
  const key = pairKey(source, target);
  const pair = REGISTRY[key];
  if (!pair) {
    throw new Error(`No prompts registered for pair: ${key}`);
  }
  if (stage === 'analyze') {
    return pair.analyze;
  }
  if (stage === 'translate') {
    return pair.translate;
  }
  throw new Error(
    `resolvePrompts: stage "${stage}" is not supported via pair registry (use editor for edit)`
  );
}

/** @deprecated Use resolvePrompts('analyze', 'en', 'ru').systemPrompt */
export { ANALYZER_SYSTEM_PROMPT } from './pairs/en-ru/analyzer.js';

/** @deprecated Use resolvePrompts('translate', 'en', 'ru').systemPrompt */
export { TRANSLATOR_SYSTEM_PROMPT } from './pairs/en-ru/translator.js';

export { createAnalyzerPrompt } from './pairs/en-ru/analyzer.js';
export { createTranslatorPrompt, createGlossaryPromptSection } from './pairs/en-ru/translator.js';
