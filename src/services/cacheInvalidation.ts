/**
 * Cache invalidation helpers for project and publication caches.
 * Used by server and background jobs (runAnalysisJob, runTranslateJob).
 */

import {
  cacheVersionedKey,
  CACHE_PREFIX,
  CACHE_SCHEMA_VERSION,
} from '../shared/cacheContract.js';
import { redisDelMany, redisDelByPattern, buildRedisKey } from './redisCache.js';
import { getPublicationByProjectId } from './supabaseDatabase.js';
import { logger } from '../logger.js';

function userProjectsCacheKey(userId: string): string {
  return buildRedisKey(CACHE_PREFIX.userProjects, userId);
}

function userProjectCacheKey(userId: string, projectId: string): string {
  return buildRedisKey(CACHE_PREFIX.userProject, userId, projectId);
}

function publicationCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publication, id);
}

function publicationChaptersCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publicationChapters, id);
}

function publicationGlossaryCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publicationGlossary, id);
}

function invalidateUserProjectCaches(userId: string, projectId?: string): Promise<void> {
  const keys = [userProjectsCacheKey(userId)];
  if (projectId) {
    keys.push(userProjectCacheKey(userId, projectId));
  }
  return redisDelMany(keys);
}

async function invalidatePublicationCaches(
  identifier: string,
  pubIdForChapters?: string
): Promise<void> {
  const keys = [
    publicationCacheKey(identifier),
    publicationChaptersCacheKey(identifier),
    publicationGlossaryCacheKey(identifier),
  ];
  await redisDelMany(keys);
  if (pubIdForChapters) {
    const pattern = cacheVersionedKey([CACHE_PREFIX.publicationChapter, pubIdForChapters, '*']);
    await redisDelByPattern(pattern);
  }
}

async function invalidatePublicationListCaches(): Promise<void> {
  const pattern = `${CACHE_SCHEMA_VERSION}:${CACHE_PREFIX.publicationsList}:*`;
  await redisDelByPattern(pattern);
}

export async function invalidateProjectAndRelatedCaches(
  userId: string,
  projectId: string,
  token: string,
  options?: { invalidatePublicationList?: boolean; useServiceRole?: boolean }
): Promise<void> {
  await invalidateUserProjectCaches(userId, projectId);
  try {
    const publication = await getPublicationByProjectId(projectId, userId, token, {
      useServiceRole: options?.useServiceRole,
    });
    if (!publication) return;
    await invalidatePublicationCaches(publication.id, publication.id);
    if (publication.slug) {
      await invalidatePublicationCaches(publication.slug);
    }
    if (options?.invalidatePublicationList) {
      await invalidatePublicationListCaches();
    }
  } catch (error) {
    logger.warn(
      { err: error, userId, projectId },
      'Failed to invalidate publication-related cache'
    );
  }
}
