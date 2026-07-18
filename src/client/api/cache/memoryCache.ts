import type {
  GlossaryEntry,
  PublicEntity,
  PublicationWithChapters,
  ReaderSettings,
} from '../../types.js';
import { PUBLICATION_CACHE_TTL_MS } from './keys.js';

export interface CacheEntry<T> {
  data: T;
  ts: number;
}

export const publicationCache = {
  withChapters: new Map<string, CacheEntry<PublicationWithChapters>>(),
  readProgress: new Map<
    string,
    CacheEntry<{
      lastReadChapterNumber: number;
    }>
  >(),
  glossary: new Map<string, CacheEntry<GlossaryEntry[]>>(),
  chapterContent: new Map<
    string,
    CacheEntry<{ id: string; number: number; title: string; translatedText: string }>
  >(),
  publicEntity: new Map<string, CacheEntry<PublicEntity>>(),
};

export const userScopedCache = {
  readerSettings: new Map<string, CacheEntry<ReaderSettings | null>>(),
  readingHistory: new Map<
    string,
    CacheEntry<{
      items: Array<{
        publicationId: string;
        title: string | null;
        coverImageUrl: string | null;
        slug: string | null;
        totalChapters: number;
        readCount: number;
        lastReadChapterNumber: number;
        continueChapterId: string | null;
        lastReadAt: string | null;
      }>;
    }>
  >(),
};

export function getCached<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs = PUBLICATION_CACHE_TTL_MS
): T | null {
  const entry = map.get(key);
  if (!entry || Date.now() - entry.ts > ttlMs) return null;
  return entry.data;
}

export function setCached<T>(map: Map<string, CacheEntry<T>>, key: string, data: T): void {
  map.set(key, { data, ts: Date.now() });
}

export function clearUserScopedCaches(): void {
  publicationCache.readProgress.clear();
  userScopedCache.readerSettings.clear();
  userScopedCache.readingHistory.clear();
}
