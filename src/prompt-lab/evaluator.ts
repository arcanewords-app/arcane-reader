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
import type {
  EvaluationIssue,
  PromptLabEvaluationResult,
  PromptLabRunRow,
  VariantEvaluation,
} from './types.js';

export interface RunEvaluationInput {
  leftRun: PromptLabRunRow;
  rightRun: PromptLabRunRow;
  leftMode: 'source' | 'output';
  rightMode: 'source' | 'output';
  referenceRun?: PromptLabRunRow | null;
  model?: string;
  glossarySnapshot?: GlossaryImportEntry[];
}

const EVALUATION_OUTPUT_MODE_ERROR = 'Both panels must use Output mode for A/B evaluation';

export class EvaluationModeError extends Error {
  constructor(message = EVALUATION_OUTPUT_MODE_ERROR) {
    super(message);
    this.name = 'EvaluationModeError';
  }
}

function resolveRunText(run: PromptLabRunRow, mode: 'source' | 'output'): string {
  if (mode === 'source') {
    return run.input_snapshot.sourceText ?? '';
  }
  return run.output.text ?? run.input_snapshot.translatedText ?? '';
}

function assertOutputMode(leftMode: 'source' | 'output', rightMode: 'source' | 'output'): void {
  if (leftMode === 'source' || rightMode === 'source') {
    throw new EvaluationModeError();
  }
}

const VALID_DIMENSIONS = new Set(['accuracy', 'fluency', 'glossary', 'style']);
const VALID_SEVERITIES = new Set(['CRITICAL', 'MAJOR', 'MINOR']);

function normalizeSeverity(value: unknown): EvaluationIssue['severity'] {
  const upper = String(value ?? 'MINOR').toUpperCase();
  if (VALID_SEVERITIES.has(upper)) return upper as EvaluationIssue['severity'];
  return 'MINOR';
}

function normalizeDimension(value: unknown): EvaluationIssue['dimension'] {
  const lower = String(value ?? 'accuracy').toLowerCase();
  if (VALID_DIMENSIONS.has(lower)) return lower as EvaluationIssue['dimension'];
  return 'accuracy';
}

function normalizeIssues(raw: unknown): EvaluationIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      paragraphIndex: typeof row.paragraphIndex === 'number' ? row.paragraphIndex : 0,
      dimension: normalizeDimension(row.dimension),
      severity: normalizeSeverity(row.severity),
      description: String(row.description ?? row.text ?? ''),
    };
  });
}

function normalizeVariant(raw: unknown): VariantEvaluation {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    issues: normalizeIssues(row.issues),
    strengths: String(row.strengths ?? ''),
  };
}

function normalizePreferredVariant(value: unknown): 'A' | 'B' | 'TIE' {
  const upper = String(value ?? 'TIE').toUpperCase();
  if (upper === 'A' || upper === 'B' || upper === 'TIE') return upper;
  return 'TIE';
}

function normalizeEvaluationResult(data: PromptLabEvaluationResult): PromptLabEvaluationResult {
  if (!data.verdict && data.score != null) {
    return data;
  }

  const verdictRaw = (data.verdict ?? {}) as Record<string, unknown>;
  return {
    analysis_scratchpad: data.analysis_scratchpad ?? '',
    variant_A: normalizeVariant(data.variant_A),
    variant_B: normalizeVariant(data.variant_B),
    verdict: {
      preferred_variant: normalizePreferredVariant(verdictRaw.preferred_variant),
      justification: String(verdictRaw.justification ?? ''),
      final_polished_version: String(verdictRaw.final_polished_version ?? ''),
    },
  };
}

export interface EvaluationPrompts {
  systemPrompt: string;
  userPrompt: string;
  compareMode: 'compare_outputs';
  targetLanguage: Language;
  stats: {
    sourceChars: number;
    leftChars: number;
    rightChars: number;
    glossaryChars: number;
  };
}

export function buildEvaluationPrompts(input: RunEvaluationInput): EvaluationPrompts {
  assertOutputMode(input.leftMode, input.rightMode);

  const reference = input.referenceRun ?? input.leftRun;
  const originalSource = reference.input_snapshot.sourceText ?? '';
  const leftText = resolveRunText(input.leftRun, input.leftMode);
  const rightText = resolveRunText(input.rightRun, input.rightMode);
  const targetLanguage = input.rightRun.params.targetLanguage as Language;

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
    originalSource,
    leftText,
    rightText,
    glossaryText,
  });

  return {
    systemPrompt,
    userPrompt,
    compareMode: 'compare_outputs',
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
    { temperature: 0.3, maxTokens: 8192 }
  );

  const result = normalizeEvaluationResult(response.data);

  return {
    result,
    tokensUsed: response.tokensUsed.total,
    durationMs: Date.now() - started,
    model,
  };
}
