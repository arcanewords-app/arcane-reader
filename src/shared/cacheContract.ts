/**
 * Shared cache contract used by client and server.
 * Keep TTLs and key namespaces in one place.
 */

export const CACHE_SCHEMA_VERSION = 'v1';

export const CACHE_TTL = {
  // Client-side
  clientPublicationMs: 60_000,
  clientProjectsMs: 5 * 60_000,
  clientReaderSettingsMs: 2 * 60_000,
  clientReadingHistoryMs: 60_000,
  clientCatalogLocalStorageMs: 10 * 60_000,

  // Server-side
  redisPublicationsListSec: 90,
  redisPublicationSec: 300,
  redisPublicationChaptersSec: 180,
  redisPublicationChapterSec: 300,
  redisPublicationGlossarySec: 300,
  redisPublicEntitiesSec: 300,
  redisProjectListSec: 60,
  redisProjectSec: 60,
  redisProjectSummarySec: 30,
  redisAuthProfileSec: 120,
  redisTokenUsageSec: 60,
  redisTokenHistorySec: 60,
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
  userProjects: 'user:projects:light',
  userProject: 'user:project:light',
  userProjectSummary: 'user:project:summary',
  userTokenUsage: 'user:token-usage',
  userTokenHistory: 'user:token-history',
  userReadingProgress: 'user:read-progress',
  userReaderSettings: 'user:reader-settings',
  userReadingHistory: 'user:reading-history',
} as const;

export function cacheVersionedKey(parts: Array<string | number | boolean>): string {
  return [CACHE_SCHEMA_VERSION, ...parts].join(':');
}
