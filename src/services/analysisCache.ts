/**
 * Redis cache for analysis results.
 * Used to skip LLM calls when chapter was already analyzed and content unchanged.
 * Cache keys include source+target language pair so overrides do not reuse wrong analysis.
 */

import { buildRedisKey, redisDelByPattern, redisGetJson, redisSetJson } from './redisCache.js';
import { CACHE_PREFIX, CACHE_TTL } from '../shared/cacheContract.js';
import type { AnalysisResult } from '../engine/types/agent.js';

export interface CachedAnalysisResult {
  chapterNumber: number;
  data: AnalysisResult;
  tokensUsed: number;
  /** Content hash when cached; used for optional validation. */
  contentHash?: string;
}

export interface AnalysisCacheLanguagePair {
  sourceLanguage: string;
  targetLanguage: string;
}

export function analysisResultCacheKey(
  projectId: string,
  chapterId: string,
  languagePair: AnalysisCacheLanguagePair
): string {
  return buildRedisKey(
    CACHE_PREFIX.analysisResult,
    projectId,
    chapterId,
    languagePair.sourceLanguage,
    languagePair.targetLanguage
  );
}

export async function getCachedAnalysisResult(
  projectId: string,
  chapterId: string,
  languagePair: AnalysisCacheLanguagePair
): Promise<CachedAnalysisResult | null> {
  const key = analysisResultCacheKey(projectId, chapterId, languagePair);
  return redisGetJson<CachedAnalysisResult>(key);
}

export async function setCachedAnalysisResult(
  projectId: string,
  chapterId: string,
  languagePair: AnalysisCacheLanguagePair,
  result: CachedAnalysisResult
): Promise<void> {
  const key = analysisResultCacheKey(projectId, chapterId, languagePair);
  await redisSetJson(key, result, CACHE_TTL.redisAnalysisResultSec);
}

/** Invalidate all cached analysis variants for one chapter (any language pair). */
export async function invalidateAnalysisForChapter(
  projectId: string,
  chapterId: string
): Promise<number> {
  const base = buildRedisKey(CACHE_PREFIX.analysisResult, projectId, chapterId);
  return redisDelByPattern(`${base}:*`);
}

export async function invalidateAnalysisForProject(projectId: string): Promise<number> {
  const base = buildRedisKey(CACHE_PREFIX.analysisResult, projectId);
  const pattern = `${base}:*`;
  return redisDelByPattern(pattern);
}
