/**
 * Shared translation token estimate (client + server daily limit checks).
 * Conservative heuristic — sync chunk defaults with engine translate-chunking-policy.
 */

/** Sync with engine translate-chunking-policy.ts */
export const PROMPT_OVERHEAD_TOKENS = 2500;
export const TRANSLATION_CHUNK_TOKENS = 3000;
export const ANALYSIS_SECTION_TOKENS = 8000;
export const EDIT_GLOSSARY_FACTOR = 0.85;

export const TOKENS_PER_10K_CHARS = {
  analysis: 5000,
  translation: 10000,
  editing: 13000,
} as const;

export const TOKENS_PER_TITLE_BATCH = 500;
export const TITLE_BATCH_SIZE = 25;

export type TranslationStageKind = 'analysis' | 'translation' | 'editing';
export type TranslationStages = TranslationStageKind[] | 'all';

export interface GlossaryEstimateEntry {
  original: string;
  translated: string;
  mentionedInChapters?: number[];
  declensions?: {
    nominative?: string;
    genitive?: string;
    dative?: string;
    accusative?: string;
    instrumental?: string;
    prepositional?: string;
  };
}

export interface TranslationTokenEstimateSettings {
  includeGlossaryInAnalysis?: boolean;
  includeGlossaryInTranslation?: boolean;
  includeGlossaryInEditing?: boolean;
}

export interface ChapterTranslationTokenEstimateInput {
  textLength: number;
  stages?: TranslationStages;
  translateChapterTitles?: boolean;
  glossary?: GlossaryEstimateEntry[];
  chapterNumber?: number;
  settings?: TranslationTokenEstimateSettings;
  /** Target language for output expansion heuristic (ru/be → 1.4). */
  targetLanguage?: string;
}

function charsToTokens(chars: number): number {
  return Math.ceil(chars / 3);
}

function estimateTokensForStages(textLength: number, stages: TranslationStages = 'all'): number {
  const charsIn10K = textLength / 10000;
  const { analysis, translation, editing } = TOKENS_PER_10K_CHARS;
  if (stages === 'all') {
    return Math.ceil((analysis + translation + editing) * charsIn10K);
  }
  let sum = 0;
  if (stages.includes('analysis')) sum += analysis;
  if (stages.includes('translation')) sum += translation;
  if (stages.includes('editing')) sum += editing;
  return Math.ceil(sum * charsIn10K);
}

export function estimateTokensForChapterTitles(chapterCount: number): number {
  if (chapterCount <= 0) return 0;
  const batches = Math.ceil(chapterCount / TITLE_BATCH_SIZE);
  return batches * TOKENS_PER_TITLE_BATCH;
}

function stageSelected(stages: TranslationStages, stage: TranslationStageKind): boolean {
  return stages === 'all' || stages.includes(stage);
}

/** Port of filterGlossaryByChapter — entries with empty mentionedInChapters are included. */
export function filterGlossaryEntriesForChapter(
  glossary: GlossaryEstimateEntry[],
  chapterNumber: number
): GlossaryEstimateEntry[] {
  return glossary.filter((entry) => {
    const chapters = entry.mentionedInChapters;
    if (!chapters || chapters.length === 0) return true;
    return chapters.includes(chapterNumber);
  });
}

function declensionCharLength(
  declensions: GlossaryEstimateEntry['declensions'] | undefined
): number {
  if (!declensions) return 0;
  return [
    declensions.nominative,
    declensions.genitive,
    declensions.dative,
    declensions.accusative,
    declensions.instrumental,
    declensions.prepositional,
  ].reduce((sum, form) => sum + (form?.trim().length ?? 0), 0);
}

export function estimateGlossaryPromptChars(entries: GlossaryEstimateEntry[]): number {
  const ENTRY_OVERHEAD_CHARS = 40;
  return entries.reduce((sum, entry) => {
    const base =
      (entry.original?.length ?? 0) +
      (entry.translated?.length ?? 0) +
      declensionCharLength(entry.declensions) +
      ENTRY_OVERHEAD_CHARS;
    return sum + base;
  }, 0);
}

function expansionFactor(targetLanguage?: string): number {
  if (targetLanguage === 'ru' || targetLanguage === 'be') return 1.4;
  return 1.2;
}

function sourceTokensFromChars(textLength: number): number {
  return charsToTokens(textLength);
}

function chunkCount(sourceTokens: number, chunkSize: number): number {
  if (sourceTokens <= 0) return 1;
  return Math.max(1, Math.ceil(sourceTokens / chunkSize));
}

function glossaryOverheadForStage(
  glossaryTokens: number,
  requestCount: number,
  factor = 1
): number {
  if (requestCount <= 0 || glossaryTokens <= 0) return 0;
  return Math.ceil(glossaryTokens * requestCount * factor + PROMPT_OVERHEAD_TOKENS * requestCount);
}

/**
 * Estimate tokens for chapter translation (text + glossary + prompt overhead per chunk/section).
 */
export function estimateChapterTranslationTokens(
  input: ChapterTranslationTokenEstimateInput
): number {
  const stages = input.stages ?? 'all';
  const settings = input.settings ?? {};
  const includeAnalysis = settings.includeGlossaryInAnalysis !== false;
  const includeTranslation = settings.includeGlossaryInTranslation !== false;
  const includeEditing = settings.includeGlossaryInEditing !== false;

  let tokens = estimateTokensForStages(input.textLength, stages);

  const translateTitles = input.translateChapterTitles !== false;
  const includesTranslation = stageSelected(stages, 'translation');
  if (translateTitles && includesTranslation) {
    tokens += estimateTokensForChapterTitles(1);
  }

  const glossary = input.glossary ?? [];
  if (glossary.length === 0 || input.chapterNumber === undefined) {
    return tokens;
  }

  const chapterGlossary = filterGlossaryEntriesForChapter(glossary, input.chapterNumber);
  if (chapterGlossary.length === 0) {
    return tokens;
  }

  const glossaryTokens = charsToTokens(estimateGlossaryPromptChars(chapterGlossary));
  const sourceTokens = sourceTokensFromChars(input.textLength);
  const outputTokens = Math.ceil(sourceTokens * expansionFactor(input.targetLanguage));

  if (stageSelected(stages, 'analysis') && includeAnalysis) {
    const sections = chunkCount(sourceTokens, ANALYSIS_SECTION_TOKENS);
    tokens += glossaryOverheadForStage(glossaryTokens, sections);
  }
  if (stageSelected(stages, 'translation') && includeTranslation) {
    const chunks = chunkCount(sourceTokens, TRANSLATION_CHUNK_TOKENS);
    tokens += glossaryOverheadForStage(glossaryTokens, chunks);
  }
  if (stageSelected(stages, 'editing') && includeEditing) {
    const editSource =
      stageSelected(stages, 'translation') || includesTranslation ? outputTokens : sourceTokens;
    const chunks = chunkCount(editSource, TRANSLATION_CHUNK_TOKENS);
    tokens += glossaryOverheadForStage(glossaryTokens, chunks, EDIT_GLOSSARY_FACTOR);
  }

  return tokens;
}

/** Batch: sum per-chapter estimates (each chapter may filter glossary differently). */
export function estimateBatchTranslationTokens(
  chapters: Array<{ textLength: number; chapterNumber: number }>,
  options: Omit<ChapterTranslationTokenEstimateInput, 'textLength' | 'chapterNumber'>
): number {
  let total = 0;
  for (const ch of chapters) {
    total += estimateChapterTranslationTokens({
      ...options,
      textLength: ch.textLength,
      chapterNumber: ch.chapterNumber,
      translateChapterTitles: false,
    });
  }
  const stages = options.stages ?? 'all';
  const includesTranslation =
    stages === 'all' || (Array.isArray(stages) && stages.includes('translation'));
  if (options.translateChapterTitles !== false && includesTranslation) {
    total += estimateTokensForChapterTitles(chapters.length);
  }
  return total;
}
