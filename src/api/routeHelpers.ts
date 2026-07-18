/**
 * Shared helpers for API route modules (extracted from server.ts).
 */

import type express from 'express';
import type { LanguagePairBody } from './schemas/index.js';
import type { ImportJobState } from '../services/importJobStore.js';
import type { AnalysisJobState } from '../services/analysisJobStore.js';
import type { TranslateJobState } from '../services/translateJobStore.js';
import type { Project, ProjectWithChapterList, PublicEntityKind } from '../storage/database.js';

import { resolveEffectiveLanguagePair } from '../services/engine-integration.js';
import {
  CACHE_PREFIX,
  CACHE_SCHEMA_VERSION,
  CACHE_TTL,
  cacheVersionedKey,
} from '../shared/cacheContract.js';
import {
  buildRedisKey,
  redisDelMany,
  redisDelByPattern,
  redisGetJson,
  redisSetJson,
} from '../services/redisCache.js';
import { logger } from '../logger.js';
import { serviceHealthManager } from '../services/serviceHealth.js';
import { readSharedHealth, shouldAwaitRecoveryProbe } from '../services/healthSnapshotStore.js';

export const translationCancelRegistry = new Map<string, boolean>();

export function translationCancelKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}

const translationProgressStore = new Map<
  string,
  { chunksDone: number; totalChunks: number; stage?: string }
>();

function translationProgressKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}

export function setTranslationProgress(
  projectId: string,
  chapterId: string,
  progress: { chunksDone: number; totalChunks: number; stage?: string }
): void {
  translationProgressStore.set(translationProgressKey(projectId, chapterId), progress);
}

export function getTranslationProgress(
  projectId: string,
  chapterId: string
): { chunksDone: number; totalChunks: number; stage?: string } | undefined {
  return translationProgressStore.get(translationProgressKey(projectId, chapterId));
}

export function clearTranslationProgress(projectId: string, chapterId: string): void {
  translationProgressStore.delete(translationProgressKey(projectId, chapterId));
}

export const SERVER_START_TIME_MS = Date.now();

export const IMPORT_JOB_FORMATS = new Set(['epub', 'fb2', 'csv']);
export const IMPORT_JOB_MAX_CHAPTERS_SNAPSHOT = 200;
export const IMPORT_JOB_TTL_SECONDS = parseInt(process.env.IMPORT_JOB_TTL_SECONDS ?? '1800', 10);
export const IMPORT_JOB_PROGRESS_UPDATE_EVERY = 5;
export const IMPORT_JOB_PROGRESS_UPDATE_MAX_STALENESS_MS = 1500;
export const IMPORT_CHAPTER_BATCH_SIZE = Math.max(
  1,
  Math.min(100, parseInt(process.env.IMPORT_CHAPTER_BATCH_SIZE ?? '20', 10) || 20)
);
export const MARK_TRANSLATED_BATCH_CHUNK_SIZE = Math.max(
  1,
  Math.min(200, parseInt(process.env.MARK_TRANSLATED_BATCH_CHUNK_SIZE ?? '100', 10) || 100)
);
export const ANALYSIS_JOB_TTL_SECONDS = parseInt(
  process.env.ANALYSIS_JOB_TTL_SECONDS ?? '3600',
  10
);
export const TRANSLATE_JOB_TTL_SECONDS = parseInt(
  process.env.TRANSLATE_JOB_TTL_SECONDS ?? '7200',
  10
);

let healthSnapshot: {
  ts: number;
  data: ReturnType<typeof serviceHealthManager.getHealthResult>;
} | null = null;
let healthCheckInProgress: Promise<void> | null = null;

export async function handleHealthCheck(res: express.Response): Promise<void> {
  try {
    const now = Date.now();

    if (!healthSnapshot) {
      const shared = await readSharedHealth();
      if (shared) {
        serviceHealthManager.applySharedHealth(shared);
        healthSnapshot = { ts: now, data: shared };
      }
    }

    const isStale = !healthSnapshot || now - healthSnapshot.ts > CACHE_TTL.healthSnapshotMs;
    const supabaseStatus =
      healthSnapshot?.data.services.supabase?.status ?? serviceHealthManager.getSupabaseStatus();

    if (shouldAwaitRecoveryProbe(isStale, supabaseStatus)) {
      await serviceHealthManager.checkAll();
      healthSnapshot = {
        ts: Date.now(),
        data: serviceHealthManager.getHealthResult(),
      };
    } else if (isStale && !healthCheckInProgress) {
      healthCheckInProgress = serviceHealthManager
        .checkAll()
        .then(() => {
          healthSnapshot = {
            ts: Date.now(),
            data: serviceHealthManager.getHealthResult(),
          };
        })
        .catch((err) => {
          logger.error({ err }, 'Health check background refresh failed');
          healthSnapshot = {
            ts: Date.now(),
            data: serviceHealthManager.getHealthResult(),
          };
        })
        .finally(() => {
          healthCheckInProgress = null;
        });
    }

    const result = healthSnapshot ? healthSnapshot.data : serviceHealthManager.getHealthResult();
    const statusCode = result.status === 'down' ? 503 : 200;
    res.status(statusCode).json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Health check failed';
    logger.error({ err: error }, 'Health check error');
    res.status(503).json({
      status: 'down',
      services: {},
      timestamp: new Date().toISOString(),
      error: errorMessage,
    });
  }
}

export async function withRedisCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = await redisGetJson<T>(key);
  if (cached != null) return cached;
  const value = await loader();
  await redisSetJson(key, value, ttlSeconds);
  return value;
}

export function userProjectsCacheKey(userId: string): string {
  return buildRedisKey(CACHE_PREFIX.userProjects, userId);
}

export function userProjectCacheKey(userId: string, projectId: string): string {
  return buildRedisKey(CACHE_PREFIX.userProject, userId, projectId);
}

export function publicationsListCacheKey(options: {
  limit: number;
  offset: number;
  orderBy: string;
  orderAsc: boolean;
  authorEntityId?: string;
  translatorEntityId?: string;
  tagEntityId?: string;
}): string {
  return buildRedisKey(
    CACHE_PREFIX.publicationsList,
    options.limit,
    options.offset,
    options.orderBy,
    options.orderAsc,
    options.authorEntityId ?? '',
    options.translatorEntityId ?? '',
    options.tagEntityId ?? ''
  );
}

export function publicationCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publication, id);
}

export function publicationChaptersCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publicationChapters, id);
}

export function publicationChapterCacheKey(publicationId: string, chapterId: string): string {
  return buildRedisKey(CACHE_PREFIX.publicationChapter, publicationId, chapterId);
}

export function publicationGlossaryCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publicationGlossary, id);
}

export function publicEntitiesCacheKey(kind?: PublicEntityKind): string {
  return buildRedisKey(CACHE_PREFIX.publicEntities, kind ?? 'all');
}

export function publicEntityCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publicEntity, id);
}

export function newsListCacheKey(options: {
  limit: number;
  offset: number;
  category?: string;
}): string {
  return buildRedisKey(
    CACHE_PREFIX.newsList,
    options.limit,
    options.offset,
    options.category ?? 'all'
  );
}

export function newsPostCacheKey(idOrSlug: string): string {
  return buildRedisKey(CACHE_PREFIX.newsPost, idOrSlug);
}

export function announcementsActiveCacheKey(userRole: string, userId?: string): string {
  return buildRedisKey(CACHE_PREFIX.announcementsActive, userRole, userId ?? 'guest');
}

export function tokenUsageCacheKey(userId: string, date: string): string {
  return buildRedisKey(CACHE_PREFIX.userTokenUsage, userId, date);
}

export function tokenUsageHistoryCacheKey(userId: string, days: number): string {
  return buildRedisKey(CACHE_PREFIX.userTokenHistory, userId, days);
}

export function readingHistoryCacheKey(userId: string): string {
  return buildRedisKey(CACHE_PREFIX.userReadingHistory, userId);
}

export function projectReportsCountCacheKey(projectId: string): string {
  return buildRedisKey(CACHE_PREFIX.projectReportsCount, projectId);
}

export function invalidateUserProjectCaches(userId: string, projectId?: string): Promise<void> {
  const keys = [userProjectsCacheKey(userId)];
  if (projectId) {
    keys.push(userProjectCacheKey(userId, projectId));
  }
  return redisDelMany(keys);
}

export async function invalidatePublicationCaches(
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

export async function invalidatePublicationListCaches(): Promise<void> {
  const pattern = `${CACHE_SCHEMA_VERSION}:${CACHE_PREFIX.publicationsList}:*`;
  await redisDelByPattern(pattern);
}

export function invalidatePublicEntitiesCaches(entityId?: string): Promise<void> {
  const keys = [
    publicEntitiesCacheKey(),
    publicEntitiesCacheKey('tag'),
    publicEntitiesCacheKey('author'),
    publicEntitiesCacheKey('translator'),
  ];
  if (entityId) {
    keys.push(publicEntityCacheKey(entityId));
  }
  return redisDelMany(keys);
}

export async function invalidateNewsCaches(postIdOrSlug?: string): Promise<void> {
  const keys: string[] = [];
  if (postIdOrSlug) {
    keys.push(newsPostCacheKey(postIdOrSlug));
  }
  await redisDelByPattern(`${CACHE_SCHEMA_VERSION}:${CACHE_PREFIX.newsList}:*`);
  await redisDelByPattern(`${CACHE_SCHEMA_VERSION}:${CACHE_PREFIX.announcementsActive}:*`);
  if (keys.length > 0) {
    await redisDelMany(keys);
  }
}

export async function invalidateAnnouncementCaches(): Promise<void> {
  await redisDelByPattern(`${CACHE_SCHEMA_VERSION}:${CACHE_PREFIX.announcementsActive}:*`);
}

export { invalidateProjectAndRelatedCaches } from '../services/cacheInvalidation.js';

export function generateImportJobId(): string {
  return `imp_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
}

export function toPublicImportJob(
  job: ImportJobState,
  options?: { compact?: boolean }
): Omit<ImportJobState, 'projectId' | 'userId' | 'cancelRequested'> & {
  progress: number;
} {
  const compact = options?.compact === true;
  return {
    jobId: job.jobId,
    status: job.status,
    phase: job.phase,
    format: job.format,
    filename: job.filename,
    current: job.current,
    total: job.total,
    progress: job.total > 0 ? Number(((job.current / job.total) * 100).toFixed(1)) : 0,
    currentChapterTitle: job.currentChapterTitle,
    warnings: job.warnings,
    errors: job.errors,
    chapters: compact ? [] : job.chapters,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

export function generateAnalysisJobId(): string {
  return `ana_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
}

export function generateTranslateJobId(): string {
  return `trl_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
}

export function isLanguagePairOverride(
  project: Project | ProjectWithChapterList,
  override?: LanguagePairBody
): override is LanguagePairBody {
  if (!override) return false;
  return (
    (project.sourceLanguage || 'en') !== override.sourceLanguage ||
    (project.targetLanguage || 'ru') !== override.targetLanguage
  );
}

export function effectiveJobLanguageFields(
  project: Project | ProjectWithChapterList,
  override?: LanguagePairBody
): { sourceLanguage: string; targetLanguage: string } {
  const { sourceLanguage, targetLanguage } = resolveEffectiveLanguagePair(project, override);
  return { sourceLanguage, targetLanguage };
}

export function warnLanguageOverrideWithGlossary(
  req: express.Request,
  project: Project | ProjectWithChapterList,
  override?: LanguagePairBody
): void {
  if (!isLanguagePairOverride(project, override)) return;
  if (project.glossary.length === 0) return;
  req.log?.warn(
    {
      event: 'translation.language_override_with_glossary',
      projectId: project.id,
      override,
      projectSource: project.sourceLanguage,
      projectTarget: project.targetLanguage,
    },
    'Language pair override with existing glossary'
  );
}

export function toPublicTranslateJob(
  job: TranslateJobState,
  options?: { compact?: boolean }
): Omit<TranslateJobState, 'projectId' | 'userId' | 'cancelRequested'> & {
  progress: number;
} {
  const compact = options?.compact === true;
  return {
    jobId: job.jobId,
    status: job.status,
    current: job.current,
    total: job.total,
    progress: job.total > 0 ? Number(((job.current / job.total) * 100).toFixed(1)) : 0,
    currentChapterTitle: job.currentChapterTitle,
    currentChapterChunksDone: job.currentChapterChunksDone,
    currentChapterTotalChunks: job.currentChapterTotalChunks,
    chapters: compact ? [] : job.chapters,
    totalTokensUsed: job.totalTokensUsed,
    errors: job.errors,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    sourceLanguage: job.sourceLanguage,
    targetLanguage: job.targetLanguage,
  };
}

export function toPublicAnalysisJob(
  job: AnalysisJobState,
  options?: { compact?: boolean }
): Omit<AnalysisJobState, 'projectId' | 'userId' | 'cancelRequested'> & {
  progress: number;
} {
  const compact = options?.compact === true;
  return {
    jobId: job.jobId,
    status: job.status,
    current: job.current,
    total: job.total,
    progress: job.total > 0 ? Number(((job.current / job.total) * 100).toFixed(1)) : 0,
    currentChapterTitle: job.currentChapterTitle,
    chapters: compact ? [] : job.chapters,
    totalTokensUsed: job.totalTokensUsed,
    errors: job.errors,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    sourceLanguage: job.sourceLanguage,
    targetLanguage: job.targetLanguage,
  };
}

export function decodeMultipartFilename(originalname: string): string {
  if (!originalname || typeof originalname !== 'string') return originalname;
  try {
    return Buffer.from(originalname, 'latin1').toString('utf8');
  } catch {
    return originalname;
  }
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g',
};
const CYRILLIC_RE = /[\u0400-\u04FF]/;

function transliterateCyrillic(text: string): string {
  return text
    .split('')
    .map((c) => {
      const lower = c.toLowerCase();
      const mapped = CYRILLIC_TO_LATIN[lower];
      if (mapped !== undefined)
        return c === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
      return CYRILLIC_RE.test(c) ? '_' : c;
    })
    .join('');
}

export function sanitizeFilename(filename: string): string {
  const transliterated = transliterateCyrillic(filename);
  return (
    transliterated
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[\u0080-\uFFFF]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 100) || 'export'
  );
}
