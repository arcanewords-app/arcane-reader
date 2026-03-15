/**
 * Redis cache for analysis results.
 * Used to skip LLM calls when chapter was already analyzed and content unchanged.
 */

import {
  buildRedisKey,
  redisDelMany,
  redisDelByPattern,
  redisGetJson,
  redisSetJson,
} from './redisCache.js';
import { CACHE_PREFIX, CACHE_TTL } from '../shared/cacheContract.js';
import type { AnalysisResult } from '../engine/types/agent.js';

export interface CachedAnalysisResult {
  chapterNumber: number;
  data: AnalysisResult;
  tokensUsed: number;
  /** Content hash when cached; used for optional validation. */
  contentHash?: string;
}

export function analysisResultCacheKey(projectId: string, chapterId: string): string {
  return buildRedisKey(CACHE_PREFIX.analysisResult, projectId, chapterId);
}

export async function getCachedAnalysisResult(
  projectId: string,
  chapterId: string
): Promise<CachedAnalysisResult | null> {
  const key = analysisResultCacheKey(projectId, chapterId);
  return redisGetJson<CachedAnalysisResult>(key);
}

export async function setCachedAnalysisResult(
  projectId: string,
  chapterId: string,
  result: CachedAnalysisResult
): Promise<void> {
  const key = analysisResultCacheKey(projectId, chapterId);
  await redisSetJson(key, result, CACHE_TTL.redisAnalysisResultSec);
}

export async function invalidateAnalysisForChapter(
  projectId: string,
  chapterId: string
): Promise<void> {
  const key = analysisResultCacheKey(projectId, chapterId);
  await redisDelMany([key]);
}

export async function invalidateAnalysisForProject(projectId: string): Promise<number> {
  const base = buildRedisKey(CACHE_PREFIX.analysisResult, projectId);
  const pattern = `${base}:*`;
  return redisDelByPattern(pattern);
}
