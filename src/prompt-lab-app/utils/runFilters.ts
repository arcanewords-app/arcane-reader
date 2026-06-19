import type { LabLanguage, LabPrompt, LabRun, LabStage } from '../api/client';
import { formatRunDisplayName } from '../api/client';
import { glossaryRunLabel, glossaryRunStatus, type GlossaryRunFilter } from './glossaryRunStatus';
import { langPairKey } from './visualTokens';

export type RunSortKey = 'newest' | 'oldest' | 'tokens' | 'duration';
export type RunStatusFilter = '' | 'success' | 'failed';

export interface RunListFilters {
  search: string;
  stage: LabStage | '';
  model: string;
  langPair: string;
  status: RunStatusFilter;
  glossary: GlossaryRunFilter;
  sort: RunSortKey;
}

export const DEFAULT_RUN_FILTERS: RunListFilters = {
  search: '',
  stage: '',
  model: '',
  langPair: '',
  status: '',
  glossary: '',
  sort: 'newest',
};

export function runModelId(run: LabRun): string {
  return typeof run.params.model === 'string' ? run.params.model : 'default';
}

export function runLangPairKey(run: LabRun): string {
  const source = run.params.sourceLanguage as LabLanguage;
  const target = run.params.targetLanguage as LabLanguage;
  return langPairKey(source, target);
}

export function uniqueRunModels(runs: LabRun[]): string[] {
  const set = new Set(runs.map(runModelId));
  return [...set].sort();
}

export function uniqueRunLangPairs(runs: LabRun[]): string[] {
  const set = new Set(runs.map(runLangPairKey));
  return [...set].sort();
}

function runSearchHaystack(run: LabRun): string {
  const parts = [
    run.displayName ?? '',
    formatRunDisplayName(run),
    run.stage,
    runModelId(run),
    runLangPairKey(run),
    typeof run.params.runLabel === 'string' ? run.params.runLabel : '',
    glossaryRunLabel(glossaryRunStatus(run), run.inputSnapshot.glossarySnapshot?.length ?? 0),
    run.inputSnapshot.sourceText.slice(0, 80),
  ];
  return parts.join(' ').toLowerCase();
}

export function filterAndSortRuns(runs: LabRun[], filters: RunListFilters): LabRun[] {
  const q = filters.search.trim().toLowerCase();
  let result = runs.filter((run) => {
    if (filters.stage && run.stage !== filters.stage) return false;
    if (filters.model && runModelId(run) !== filters.model) return false;
    if (filters.langPair && runLangPairKey(run) !== filters.langPair) return false;
    if (filters.status === 'success' && !run.output.success) return false;
    if (filters.status === 'failed' && run.output.success) return false;
    if (filters.glossary && glossaryRunStatus(run) !== filters.glossary) return false;
    if (q && !runSearchHaystack(run).includes(q)) return false;
    return true;
  });

  result = [...result];
  switch (filters.sort) {
    case 'oldest':
      result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      break;
    case 'tokens':
      result.sort((a, b) => b.tokensUsed - a.tokensUsed);
      break;
    case 'duration':
      result.sort((a, b) => b.durationMs - a.durationMs);
      break;
    case 'newest':
    default:
      result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
  }
  return result;
}

export interface PromptListFilters {
  search: string;
  stage: LabStage | '';
  langPair: string;
}

export const DEFAULT_PROMPT_FILTERS: PromptListFilters = {
  search: '',
  stage: '',
  langPair: '',
};

function promptLangPairKey(prompt: LabPrompt): string {
  return langPairKey(prompt.sourceLanguage, prompt.targetLanguage);
}

export function uniquePromptLangPairs(prompts: LabPrompt[]): string[] {
  const set = new Set(prompts.map(promptLangPairKey));
  return [...set].sort();
}

export function filterPrompts(prompts: LabPrompt[], filters: PromptListFilters): LabPrompt[] {
  const q = filters.search.trim().toLowerCase();
  return prompts.filter((p) => {
    if (filters.stage && p.stage !== filters.stage) return false;
    if (filters.langPair && promptLangPairKey(p) !== filters.langPair) return false;
    if (!q) return true;
    const haystack = [
      p.name,
      p.stage,
      p.sourceLanguage,
      p.targetLanguage,
      p.origin,
      p.preset ?? '',
      p.focus ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function hasActiveRunFilters(filters: RunListFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.stage !== '' ||
    filters.model !== '' ||
    filters.langPair !== '' ||
    filters.status !== '' ||
    filters.glossary !== '' ||
    filters.sort !== 'newest'
  );
}

export function hasActivePromptFilters(filters: PromptListFilters): boolean {
  return filters.search.trim() !== '' || filters.stage !== '' || filters.langPair !== '';
}
