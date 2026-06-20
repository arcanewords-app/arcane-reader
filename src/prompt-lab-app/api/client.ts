export type LabStage = 'analyze' | 'translate' | 'edit';
export type LabLanguage = 'en' | 'ko' | 'zh' | 'ru' | 'be';
export type EditingPreset = 'default' | 'literary' | 'minimal' | 'ai_revivification';
export type EditingFocus = 'fix_only' | 'polish' | 'elevate';

export interface LabMetaPair {
  source: LabLanguage;
  target: LabLanguage;
  label: string;
}

export interface LabMetaModel {
  value: string;
  label: string;
  family?: string;
  supportsCustomTemperature?: boolean;
  supportsReasoningEffort?: boolean;
  promoFreeTier?: boolean;
  isReasoningModel?: boolean;
}

export interface LabMeta {
  pairs: LabMetaPair[];
  stages: LabStage[];
  presets: EditingPreset[];
  focusOptions: EditingFocus[];
  defaultModel: string;
  models: LabMetaModel[];
  modelCapabilities?: LabMetaModel[];
  analysisExcludedModels: string[];
}

export interface WorkbenchLoadState {
  stage?: LabStage;
  sourceLanguage?: LabLanguage;
  targetLanguage?: LabLanguage;
  sourceText?: string;
  translatedText?: string;
  glossarySnapshot?: GlossarySnapshotEntry[] | null;
  systemPrompt?: string;
  userPromptOverride?: string;
  useUserOverride?: boolean;
  model?: string;
  temperature?: number;
  preset?: EditingPreset;
  focus?: EditingFocus;
  promptId?: string | null;
  customInstructions?: string;
  chapterNumber?: number;
  includeGlossary?: boolean;
  chunkSize?: number;
  enableTranslateFewShot?: boolean;
  enableTranslateCoT?: boolean;
  enableTranslateStructuredCoT?: boolean;
  translateLeadingContextParagraphs?: number;
  miniModelTranslationProfile?: boolean;
  forceChunked?: boolean;
  translateExecutionMode?: 'one_shot' | 'chunked';
  editExecutionMode?: 'one_shot' | 'chunked';
  /** @deprecated */
  translateQualityPreset?: 'one_shot' | 'chunked' | 'fast' | 'standard' | 'enhanced';
  /** @deprecated */
  editQualityPreset?: 'one_shot' | 'chunked' | 'fast' | 'standard' | 'enhanced';
  reasoningEffort?: 'low' | 'medium' | 'high';
  runLabel?: string;
}

export interface GlossarySnapshotEntry {
  type?: 'character' | 'location' | 'term';
  original: string;
  translated?: string;
  gender?: 'male' | 'female' | 'neutral' | 'unknown';
  description?: string;
  notes?: string;
}

export interface LabPrompt {
  id: string;
  stage: LabStage;
  sourceLanguage: LabLanguage;
  targetLanguage: LabLanguage;
  name: string;
  systemPrompt: string;
  userPromptOverride: string | null;
  preset: EditingPreset | null;
  focus: EditingFocus | null;
  origin: 'seed' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface LabText {
  id: string;
  title: string;
  sourceLanguage: LabLanguage;
  targetLanguage: LabLanguage;
  stageHint: string | null;
  content: string;
  translatedText: string | null;
  glossarySnapshot: GlossarySnapshotEntry[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisEntity {
  name?: string;
  term?: string;
  isNew: boolean;
  suggestedTranslation?: string;
  context?: string;
  category?: string;
}

export interface AnalysisOutput {
  chapterNumber: number;
  foundCharacters: AnalysisEntity[];
  foundLocations: AnalysisEntity[];
  foundTerms: AnalysisEntity[];
  chapterSummary: string;
  keyEvents: string[];
  mood: string;
  styleNotes?: string;
}

export type CompareMode = 'source' | 'output';

export interface EvaluationIssue {
  paragraphIndex: number;
  dimension: 'accuracy' | 'fluency' | 'glossary' | 'style';
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  description: string;
}

export interface VariantEvaluation {
  issues: EvaluationIssue[];
  strengths: string;
}

export interface LabEvaluationResult {
  analysis_scratchpad?: string;
  variant_A?: VariantEvaluation;
  variant_B?: VariantEvaluation;
  verdict?: {
    preferred_variant: 'A' | 'B' | 'TIE';
    justification: string;
    final_polished_version: string;
    final_polished_excerpt?: string;
  };
  /** @deprecated Legacy format */
  score?: number;
  dimensions?: {
    accuracy?: number;
    fluency?: number;
    glossary?: number;
    style?: number;
  };
  issues?: Array<{ paragraphIndex?: number; severity?: string; text: string }>;
  suggestions?: string[];
  summary?: string;
}

export interface LabEvaluation {
  id: string;
  leftRunId: string | null;
  rightRunId: string | null;
  leftMode: CompareMode;
  rightMode: CompareMode;
  score: number | null;
  result: LabEvaluationResult;
  model: string | null;
  tokensUsed: number;
  durationMs: number;
  createdAt: string;
}

export interface LabRunOutput {
  stage: LabStage;
  success: boolean;
  error?: string;
  text?: string;
  analysis?: AnalysisOutput;
  tokensUsed: number;
  durationMs: number;
  prompts: { system: string; user: string };
  apiRequestParams?: Record<string, unknown>;
  translateDebug?: {
    translateExecutionMode?: 'one_shot' | 'chunked';
    resolvedFlags: {
      enableFewShot: boolean;
      enableCoT: boolean;
      enableStructuredCoT: boolean;
      leadingContextParagraphs: number;
    };
    llmDefaults: {
      maxTokens: number;
      defaultReasoningEffort?: 'low' | 'medium' | 'high';
      preferJsonObjectOverStructuredSchema: boolean;
    };
    effectiveChunkSize: number;
    chunkingMode?: 'single_shot' | 'chunked';
    chunkingReason?: string;
    chunkSizeTier?: 'single' | 'large' | 'standard';
    actualChunks?: number;
    estimatedInputTokens?: number;
    estimatedOutputTokens?: number;
    effectiveMaxTokens?: number;
    chunkSummaries?: Array<{
      chunkId: string;
      completionPath?: 'structured' | 'json_object' | 'text';
      finishReason?: string;
      error?: string;
    }>;
  };
  editDebug?: {
    editExecutionMode?: 'one_shot' | 'chunked';
    editingStylePreset: EditingPreset;
    editingFocus: EditingFocus;
    chunkingMode: 'single_shot' | 'chunked';
    chunkingReason: string;
    chunkSizeTier?: 'single' | 'large' | 'standard';
    effectiveChunkSize: number;
    estimatedChunks: number;
    actualChunks?: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    effectiveMaxTokens: number;
    draftLength: number;
    outputLength?: number;
  };
  runId?: string;
}

export interface LabRun {
  id: string;
  textId: string | null;
  promptId: string | null;
  stage: LabStage;
  displayName: string | null;
  params: Record<string, unknown>;
  inputSnapshot: {
    sourceText: string;
    translatedText?: string;
    glossarySnapshot?: GlossarySnapshotEntry[];
    systemPrompt: string;
    userPrompt: string;
  };
  output: LabRunOutput;
  tokensUsed: number;
  durationMs: number;
  createdAt: string;
}

export function formatRunDisplayName(run: LabRun): string {
  if (run.displayName?.trim()) return run.displayName;
  const model = typeof run.params.model === 'string' ? run.params.model : 'default';
  const temp = typeof run.params.temperature === 'number' ? run.params.temperature : '—';
  return `${run.stage} · ${run.params.sourceLanguage as string}→${run.params.targetLanguage as string} · ${model} · temp ${temp}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function fetchMeta(): Promise<LabMeta> {
  return apiFetch('/api/prompt-lab/meta');
}

export function fetchCurrentPrompt(params: {
  stage: LabStage;
  source: LabLanguage;
  target: LabLanguage;
  preset?: EditingPreset;
  focus?: EditingFocus;
}): Promise<{ systemPrompt: string }> {
  const q = new URLSearchParams({
    stage: params.stage,
    source: params.source,
    target: params.target,
  });
  if (params.preset) q.set('preset', params.preset);
  if (params.focus) q.set('focus', params.focus);
  return apiFetch(`/api/prompt-lab/prompts/current?${q}`);
}

export function previewUserPrompt(body: Record<string, unknown>): Promise<{ userPrompt: string }> {
  return apiFetch('/api/prompt-lab/prompts/preview-user', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchPrompts(filters?: {
  stage?: LabStage;
  source?: LabLanguage;
  target?: LabLanguage;
}): Promise<{ prompts: LabPrompt[] }> {
  const q = new URLSearchParams();
  if (filters?.stage) q.set('stage', filters.stage);
  if (filters?.source) q.set('source', filters.source);
  if (filters?.target) q.set('target', filters.target);
  const qs = q.toString();
  return apiFetch(`/api/prompt-lab/prompts${qs ? `?${qs}` : ''}`);
}

export function savePrompt(body: {
  stage: LabStage;
  sourceLanguage: LabLanguage;
  targetLanguage: LabLanguage;
  name: string;
  systemPrompt: string;
  userPromptOverride?: string | null;
  preset?: EditingPreset | null;
  focus?: EditingFocus | null;
}): Promise<LabPrompt> {
  return apiFetch('/api/prompt-lab/prompts', { method: 'POST', body: JSON.stringify(body) });
}

export function deletePrompt(id: string): Promise<void> {
  return apiFetch(`/api/prompt-lab/prompts/${id}`, { method: 'DELETE' });
}

export function updatePrompt(
  id: string,
  body: {
    name?: string;
    systemPrompt?: string;
    userPromptOverride?: string | null;
    preset?: EditingPreset | null;
    focus?: EditingFocus | null;
  }
): Promise<LabPrompt> {
  return apiFetch(`/api/prompt-lab/prompts/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function fetchTexts(): Promise<{ texts: LabText[] }> {
  return apiFetch('/api/prompt-lab/texts');
}

export function saveText(body: {
  title: string;
  sourceLanguage: LabLanguage;
  targetLanguage: LabLanguage;
  content: string;
  translatedText?: string;
  glossarySnapshot?: GlossarySnapshotEntry[];
  stageHint?: string;
}): Promise<LabText> {
  return apiFetch('/api/prompt-lab/texts', { method: 'POST', body: JSON.stringify(body) });
}

export function deleteText(id: string): Promise<void> {
  return apiFetch(`/api/prompt-lab/texts/${id}`, { method: 'DELETE' });
}

export function fetchRuns(limit = 50): Promise<{ runs: LabRun[] }> {
  return apiFetch(`/api/prompt-lab/runs?limit=${limit}`);
}

export function deleteRun(id: string): Promise<void> {
  return apiFetch(`/api/prompt-lab/runs/${id}`, { method: 'DELETE' });
}

export function patchRun(id: string, body: { displayName: string }): Promise<LabRun> {
  return apiFetch(`/api/prompt-lab/runs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function fetchEvaluations(runId?: string): Promise<{ evaluations: LabEvaluation[] }> {
  const q = runId ? `?runId=${encodeURIComponent(runId)}` : '';
  return apiFetch(`/api/prompt-lab/evaluations${q}`);
}

export function deleteEvaluation(id: string): Promise<void> {
  return apiFetch(`/api/prompt-lab/evaluations/${id}`, { method: 'DELETE' });
}

export function evaluateRuns(body: {
  leftRunId: string;
  rightRunId: string;
  leftMode?: CompareMode;
  rightMode?: CompareMode;
  referenceRunId?: string;
  model?: string;
}): Promise<LabEvaluation> {
  return apiFetch('/api/prompt-lab/evaluate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface LabEvaluationPreview {
  systemPrompt: string;
  userPrompt: string;
  compareMode: 'compare_outputs';
  stats: {
    sourceChars: number;
    leftChars: number;
    rightChars: number;
    glossaryChars: number;
    totalChars: number;
    maxInputChars: number;
    tooLarge: boolean;
    compactOutput: boolean;
  };
}

export function previewEvaluation(body: {
  leftRunId: string;
  rightRunId: string;
  leftMode?: CompareMode;
  rightMode?: CompareMode;
  referenceRunId?: string;
}): Promise<LabEvaluationPreview> {
  return apiFetch('/api/prompt-lab/evaluate/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function runStage(body: Record<string, unknown>): Promise<LabRunOutput> {
  return apiFetch('/api/prompt-lab/run', { method: 'POST', body: JSON.stringify(body) });
}

export async function importGlossaryFile(file: File): Promise<{
  entries: GlossarySnapshotEntry[];
  errors: Array<{ row: number; message: string }>;
}> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/prompt-lab/glossary/import', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}
