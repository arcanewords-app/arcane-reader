/**
 * LLM evaluation runner for Prompt Lab Review.
 */

import { loadConfig } from '../config.js';
import {
  OpenAIProvider,
  GlossaryManager,
  languageDisplayName,
  type Language,
} from '../engine/index.js';
import type { GlossaryImportEntry } from '../api/schemas/glossary.js';
import { portableEntriesToGlossary } from './glossary.js';
import {
  buildPromptLabEvaluatorUserPrompt,
  getPromptLabEvaluatorSystemPrompt,
} from './prompts/evaluator.js';
import type { PromptLabEvaluationResult, PromptLabRunRow } from './types.js';

export interface RunEvaluationInput {
  leftRun: PromptLabRunRow;
  rightRun: PromptLabRunRow;
  leftMode: 'source' | 'output';
  rightMode: 'source' | 'output';
  referenceRun?: PromptLabRunRow | null;
  model?: string;
  glossarySnapshot?: GlossaryImportEntry[];
}

function resolveRunText(run: PromptLabRunRow, mode: 'source' | 'output'): string {
  if (mode === 'source') {
    return run.input_snapshot.sourceText ?? '';
  }
  return run.output.text ?? run.input_snapshot.translatedText ?? '';
}

function runMetaLabel(run: PromptLabRunRow): string {
  const model = run.params.model ?? 'default';
  const name = run.display_name ?? run.stage;
  return `${name} (${run.stage}, ${model})`;
}

export interface EvaluationPrompts {
  systemPrompt: string;
  userPrompt: string;
  compareMode: 'review' | 'compare_outputs';
  targetLanguage: Language;
  stats: {
    sourceChars: number;
    leftChars: number;
    rightChars: number;
    glossaryChars: number;
  };
}

export function buildEvaluationPrompts(input: RunEvaluationInput): EvaluationPrompts {
  const reference = input.referenceRun ?? input.leftRun;
  const originalSource = reference.input_snapshot.sourceText ?? '';
  const leftText = resolveRunText(input.leftRun, input.leftMode);
  const rightText = resolveRunText(input.rightRun, input.rightMode);
  const targetLanguage = input.rightRun.params.targetLanguage as Language;

  const leftIsSource = input.leftMode === 'source';
  const rightIsSource = input.rightMode === 'source';
  const compareMode = !leftIsSource && !rightIsSource ? 'compare_outputs' : 'review';

  let glossaryText = '';
  if (input.glossarySnapshot?.length) {
    const glossary = portableEntriesToGlossary(input.glossarySnapshot);
    glossaryText = new GlossaryManager(glossary).toPromptText({
      targetLanguageLabel: languageDisplayName(targetLanguage),
    });
  } else if (input.rightRun.input_snapshot.glossarySnapshot?.length) {
    const glossary = portableEntriesToGlossary(input.rightRun.input_snapshot.glossarySnapshot);
    glossaryText = new GlossaryManager(glossary).toPromptText({
      targetLanguageLabel: languageDisplayName(targetLanguage),
    });
  }

  const systemPrompt = getPromptLabEvaluatorSystemPrompt(targetLanguage);
  const userPrompt = buildPromptLabEvaluatorUserPrompt({
    sourceLanguage: input.rightRun.params.sourceLanguage as Language,
    targetLanguage,
    originalSource,
    leftText,
    rightText,
    leftLabel: runMetaLabel(input.leftRun),
    rightLabel: runMetaLabel(input.rightRun),
    glossaryText,
    compareMode,
  });

  return {
    systemPrompt,
    userPrompt,
    compareMode,
    targetLanguage,
    stats: {
      sourceChars: originalSource.length,
      leftChars: leftText.length,
      rightChars: rightText.length,
      glossaryChars: glossaryText.length,
    },
  };
}

export async function runPromptLabEvaluation(input: RunEvaluationInput): Promise<{
  result: PromptLabEvaluationResult;
  tokensUsed: number;
  durationMs: number;
  model: string;
}> {
  const appConfig = loadConfig();
  const model = input.model?.trim() || appConfig.openai.model;
  const provider = new OpenAIProvider({ apiKey: appConfig.openai.apiKey, model });

  const { systemPrompt, userPrompt } = buildEvaluationPrompts(input);

  const started = Date.now();
  const response = await provider.completeJSON<PromptLabEvaluationResult>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, maxTokens: 4096 }
  );

  const result: PromptLabEvaluationResult = {
    score: response.data.score ?? 7,
    dimensions: response.data.dimensions,
    issues: response.data.issues ?? [],
    suggestions: response.data.suggestions ?? [],
    summary: response.data.summary ?? '',
  };

  return {
    result,
    tokensUsed: response.tokensUsed.total,
    durationMs: Date.now() - started,
    model,
  };
}
