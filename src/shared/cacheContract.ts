/**
 * Shared cache contract used by client and server.
 * Keep TTLs and key namespaces in one place.
 */

export const CACHE_SCHEMA_VERSION = 'v1';

/** Max chapters to load per project (Supabase default is 1000). */
export const MAX_CHAPTERS_PER_PROJECT = 50_000;

/** Max paragraphs to fetch for chapter summary (Supabase default is 1000). */
export const MAX_PARAGRAPHS_FOR_SUMMARY = 500_000;

/** PostgREST default row limit per request (Supabase caps SELECT at this). */
export const POSTGREST_MAX_ROWS = 1000;

export const CACHE_TTL = {
  // Client-side
  clientPublicationMs: 120_000, // 2 min — public content rarely changes
  clientProjectsMs: 5 * 60_000,
  clientReaderSettingsMs: 2 * 60_000,
  clientReadingHistoryMs: 60_000,
  clientCatalogLocalStorageMs: 5 * 60_000, // 5 min

  // Server-side — public content (publications, chapters, glossary, entities)
  redisPublicationsListSec: 180, // 3 min — catalog updates more often
  redisPublicationSec: 600, // 10 min
  redisPublicationChaptersSec: 600,
  redisPublicationChapterSec: 600,
  redisPublicationGlossarySec: 600,
  redisPublicEntitiesSec: 600,
  redisPublicEntitySec: 600, // single entity by id

  // Server-side — user-scoped (fresher for editing)
  redisProjectListSec: 60,
  redisProjectSec: 120,
  redisProjectSummarySec: 60,
  redisAuthProfileSec: 180,
  redisTokenUsageSec: 60,
  redisTokenHistorySec: 60,
  /** Analysis results per chapter. Invalidate on chapter content change. */
  redisAnalysisResultSec: 86400, // 24 h
  /** Project reports count (translation complaints). */
  redisProjectReportsCountSec: 120,
  healthSnapshotMs: 10_000,
} as const;

export const CACHE_PREFIX = {
  authProfile: 'auth:profile',
  publicationsList: 'pub:list',
  publication: 'pub:by-id',
  publicationChapters: 'pub:chapters',
  publicationChapter: 'pub:chapter',
  publicationGlossary: 'pub:glossary',
  publicEntities: 'public:entities',
  publicEntity: 'public:entity',
  userProjects: 'user:projects:light',
  userProject: 'user:project:light',
  userProjectSummary: 'user:project:summary',
  userTokenUsage: 'user:token-usage',
  userTokenHistory: 'user:token-history',
  userReadingProgress: 'user:read-progress',
  userReaderSettings: 'user:reader-settings',
  userReadingHistory: 'user:reading-history',
  analysisResult: 'analysis:result',
  analysisBatchProgress: 'analysis:batch:progress',
  projectReportsCount: 'user:project:reports-count',
} as const;

export function cacheVersionedKey(parts: Array<string | number | boolean>): string {
  return [CACHE_SCHEMA_VERSION, ...parts].join(':');
}
